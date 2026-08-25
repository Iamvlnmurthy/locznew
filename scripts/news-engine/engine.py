"""LocZ News Engine — runs on the GPU box (RTX 5060).

Hourly:  pull (feeds.json = states x categories)  ->  fetch body + og:image  ->  regenerate English
in LocZ voice (local LLM, journalist brief)  ->  INTEGRITY GATE (drop-on-fail)  ->  translate to
Hindi + state language (IndicTrans2)  ->  categorize  ->  POST to VPS (news_stories).

Local + free. The VPS only serves. Interim rule: a story that fails the integrity gate is DROPPED.
Scale is bounded by MAX_PER_FEED / MAX_PER_CYCLE and a local seen-file so seen articles aren't
reprocessed and the GPU budget is never blown.

Run:  python engine.py once [--limit N]   |   python engine.py loop
"""
import base64, json, os, re, sys, io, time, subprocess, hashlib, random
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

MAX_AGE_DAYS = int(os.environ.get("MAX_AGE_DAYS", "3"))  # skip stale articles — this is NEWS


def fresh_enough(published):
    """True unless the article's publish date is older than MAX_AGE_DAYS. Unknown date = allow."""
    if not published:
        return True
    try:
        pub = parsedate_to_datetime(published)
        if pub.tzinfo is None:
            pub = pub.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - pub).days <= MAX_AGE_DAYS
    except Exception:
        return True
from urllib.parse import quote
import requests
from bs4 import BeautifulSoup

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
OLLAMA = "http://127.0.0.1:11434/api/generate"
LLM = "qwen2.5:7b-instruct"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
S = requests.Session(); S.headers.update({"User-Agent": UA})

HI = "hin_Deva"
LANG_TRIPLE = {"te": "tel_Telu", "hi": "hin_Deva", "ta": "tam_Taml", "kn": "kan_Knda",
               "mr": "mar_Deva", "bn": "ben_Beng", "ml": "mal_Mlym", "gu": "guj_Gujr",
               "or": "ory_Orya", "pa": "pan_Guru", "as": "asm_Beng"}

FEEDS_JSON = os.path.join(HERE, "feeds.json")
SEEN_FILE = os.path.join(HERE, "seen.txt")
MAX_PER_FEED = int(os.environ.get("MAX_PER_FEED", "4"))       # new stories per feed per cycle
MAX_PER_CYCLE = int(os.environ.get("MAX_PER_CYCLE", "120"))   # GPU budget guard per hour
MAX_SECONDS = int(os.environ.get("MAX_SECONDS", "600"))       # hard wall-clock cap per cycle (10 min)
PUSH_DELAY = float(os.environ.get("PUSH_DELAY", "2"))         # pause between VPS writes — slow serial
                                                              # queue so the VPS is never hammered


def load_feeds():
    try:
        return json.load(open(FEEDS_JSON, encoding="utf-8"))
    except Exception:
        return [{"category": "local", "state": "Telangana", "city": "Hyderabad",
                 "lat": 17.385, "lng": 78.4867, "state_lang": "te",
                 "url": "https://news.google.com/rss/search?q=Hyderabad&hl=en-IN&gl=IN&ceid=IN:en"}]


def load_seen():
    try:
        return set(open(SEEN_FILE, encoding="utf-8").read().split())
    except Exception:
        return set()


def mark_seen(url):
    with open(SEEN_FILE, "a", encoding="utf-8") as f:
        f.write(url + "\n")


# ---------- source resolution ----------
def decode_gnews(url):
    m = re.search(r"/articles/([A-Za-z0-9_\-]+)", url)
    if not m:
        return None
    ident = m.group(1)
    try:
        raw = base64.urlsafe_b64decode(ident + "=" * (-len(ident) % 4))
        f = re.search(rb"https?://[^\x00-\x1f\"'<> ]+", raw)
        if f and b"news.google" not in f.group(0):
            return f.group(0).decode("utf-8", "ignore")
    except Exception:
        pass
    try:
        h = S.get(f"https://news.google.com/rss/articles/{ident}", timeout=20).text
        div = BeautifulSoup(h, "html.parser").select_one("c-wiz > div")
        sig, ts = div["data-n-a-sg"], div["data-n-a-ts"]
        inner = ('["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,'
                 'null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"'
                 + ident + '",' + ts + ',"' + sig + '"]')
        freq = json.dumps([[["Fbv4je", inner, None, "generic"]]])
        r = S.post("https://news.google.com/_/DotsSplashUi/data/batchexecute",
                   headers={"content-type": "application/x-www-form-urlencoded;charset=UTF-8"},
                   data="f.req=" + quote(freq), timeout=20)
        txt = r.text.replace(")]}'", "", 1)
        return json.loads(json.loads(txt.split("\n", 1)[1].strip().split("\n")[0])[0][2])[1]
    except Exception:
        return None


def fetch_article(url):
    r = S.get(url, timeout=25, allow_redirects=True)
    soup = BeautifulSoup(r.text, "html.parser")
    og = soup.find("meta", property="og:image")
    img = og["content"] if og and og.get("content") else ""
    for t in soup(["script", "style", "nav", "footer", "header", "aside", "form", "figure"]):
        t.decompose()
    node = soup.find("article") or soup.body or soup
    paras = [p.get_text(" ", strip=True) for p in node.find_all("p")]
    paras = [p for p in paras if len(p) > 40 and not re.search(
        r"(subscrib|log ?in|log ?out|a post shared|©|cookie|newsletter)", p, re.I)]
    return "\n".join(paras), img


# ---------- regenerate (LocZ journalist voice) ----------
BRIEF = """You are LocZ's senior news editor, thirty years on the city desk. Rewrite the report
below as an ORIGINAL LocZ story a busy local reader wants to read.

OUTPUT EXACTLY:
HEADLINE: <specific, active, <=70 chars, names the place, no clickbait, no caps-lock>
DEK: <one line: why a local reader cares>
<blank line>
<2-4 short paragraphs, inverted pyramid: what happened + why it matters locally first, then
context, then what's next. Active voice, concrete nouns, one idea per sentence.>

RULES (never break):
- Every fact, name, number, date and place EXACTLY as in the report.
- NEVER put words in quotation marks unless those exact words are in the report.
- Add nothing not in the report. Neutral on unproven claims (police allege / residents say).
- No hype, no invented drama.

REPORT:
"""


def ollama(prompt, timeout=180):
    body = json.dumps({"model": LLM, "prompt": prompt, "stream": False,
                       "options": {"temperature": 0.5}}).encode("utf-8")
    r = S.post(OLLAMA, data=body, headers={"Content-Type": "application/json"}, timeout=timeout)
    return r.json()["response"].strip()


def regenerate(src_body):
    out = ollama(BRIEF + src_body[:5000])
    head = re.search(r"HEADLINE:\s*(.+)", out)
    dek = re.search(r"DEK:\s*(.+)", out)
    parts = re.split(r"\n\s*\n", out, 1)
    body_txt = parts[1].strip() if len(parts) > 1 else out
    body_txt = re.sub(r"^(HEADLINE|DEK):.*$", "", body_txt, flags=re.M).strip()
    return (head.group(1).strip() if head else "", dek.group(1).strip() if dek else "", body_txt)


# ---------- integrity gate (drop-on-fail) ----------
def norm(s):
    return re.sub(r"\s+", " ", s.lower())


def integrity_ok(title, body, src):
    nsrc = norm(src)
    text = title + "\n" + body
    for q in re.findall(r"[\"“]([^\"”]{6,})[\"”]", text):
        if norm(q) not in nsrc:
            return False, f"fabricated quote: {q[:40]}"
    src_nospace = re.sub(r"[,\s]", "", src)
    for num in set(re.findall(r"\b\d{2,}\b", text)):
        if num not in src_nospace and num not in src:
            return False, f"invented number: {num}"
    if not (150 <= len(body) <= 3000):
        return False, f"bad length {len(body)}"
    return True, "ok"


# ---------- translate (IndicTrans2) ----------
_it2 = {}


def it2_load():
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    from IndicTransToolkit.processor import IndicProcessor
    name = "ai4bharat/indictrans2-en-indic-1B"
    _it2["ip"] = IndicProcessor(inference=True)
    _it2["tok"] = AutoTokenizer.from_pretrained(name, trust_remote_code=True)
    _it2["model"] = AutoModelForSeq2SeqLM.from_pretrained(
        name, trust_remote_code=True, torch_dtype=torch.float16).to("cuda").eval()
    _it2["torch"] = torch


def translate(text, tgt_code):
    torch = _it2["torch"]; ip = _it2["ip"]; tok = _it2["tok"]; model = _it2["model"]
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    if not sents:
        return ""
    batch = ip.preprocess_batch(sents, src_lang="eng_Latn", tgt_lang=tgt_code)
    inp = tok(batch, truncation=True, padding="longest", return_tensors="pt").to("cuda")
    with torch.no_grad():
        out = model.generate(**inp, max_length=256, num_beams=5)
    dec = tok.batch_decode(out, skip_special_tokens=True)
    return " ".join(ip.postprocess_batch(dec, lang=tgt_code))


# ---------- push to VPS ----------
def push(stories):
    if not stories:
        return 0
    payload = json.dumps(stories, ensure_ascii=False)
    p = subprocess.run(["ssh", "onrol", "sudo -u locz python3 /tmp/insert_stories.py"],
                       input=payload.encode("utf-8"), capture_output=True, timeout=120)
    sys.stdout.write(p.stdout.decode("utf-8", "replace"))
    if p.returncode != 0:
        sys.stderr.write(p.stderr.decode("utf-8", "replace"))
    # Pace the writes: one small INSERT at a time with a gap, so the VPS never sees a burst of
    # concurrent load (the swap-thrash that hung it before came from parallel heavy jobs).
    if PUSH_DELAY > 0:
        time.sleep(PUSH_DELAY)
    return len(stories)


def feedparser_parse(url):
    import feedparser
    d = feedparser.parse(S.get(url, timeout=25).content)
    return [{"link": e.get("link"), "title": e.get("title"), "published": e.get("published"),
             "source": (e.get("source", {}) or {}).get("title", "")} for e in d.entries[:100]]


# ---------- one cycle ----------
def cycle(limit=None):
    it2_load()
    seen = load_seen()
    feeds = load_feeds()
    # The per-cycle budget (120) covers only ~30 of 230 feeds, and a fixed alphabetical order meant
    # the first states (Andhra Pradesh…) ate the whole budget every cycle while Telangana (19th) and
    # everything after it never ran. Put the home market (Telangana/Hyderabad) first so local news is
    # always covered, then shuffle the rest so every other state gets fair rotation across cycles.
    home = [f for f in feeds if f.get("state") == "Telangana"]
    rest = [f for f in feeds if f.get("state") != "Telangana"]
    random.shuffle(rest)
    feeds = home + rest
    print(f"models ready; {len(feeds)} feeds ({len(home)} home-first), {len(seen)} already seen", flush=True)
    kept = dropped = 0
    stories = []
    budget = limit or MAX_PER_CYCLE
    # Hard wall-clock cap on generation. The box is a shared workstation: run a short burst each hour
    # then exit so the ~18GB of models is freed for the rest of the hour (launcher sleeps the gap).
    t_start = time.time()
    for feed in feeds:
        if kept >= budget:
            break
        if time.time() - t_start > MAX_SECONDS:
            print(f"time cap {MAX_SECONDS}s reached; stopping cycle early", flush=True)
            break
        try:
            items = feedparser_parse(feed["url"])
        except Exception as e:
            print(f"feed error {feed['category']}/{feed['state']}: {e}"); continue
        kept_here = 0
        for it in items:
            if kept >= budget or kept_here >= MAX_PER_FEED:
                break
            if not fresh_enough(it.get("published")):
                continue  # months-old evergreen the feed returned — not news
            src = decode_gnews(it["link"])
            if not src or src in seen:
                continue
            seen.add(src); mark_seen(src)
            try:
                body, img = fetch_article(src)
            except Exception:
                dropped += 1; continue
            if len(body) < 200:
                dropped += 1; continue
            try:
                title, dek, body_en = regenerate(body)
            except Exception:
                dropped += 1; continue
            ok, why = integrity_ok(title, body_en, body)
            if not ok or not title:
                dropped += 1; continue
            tgt = feed.get("state_lang", "hi")
            try:
                title_hi = translate(title, HI); body_hi = translate(body_en, HI)
                if tgt != "hi" and tgt in LANG_TRIPLE:
                    triple = LANG_TRIPLE[tgt]
                    title_sl = translate(title, triple); body_sl = translate(body_en, triple)
                else:
                    title_sl = body_sl = None
            except Exception:
                dropped += 1; continue
            # Telugu is a first-class UI language (its own switcher tab) that reads the dedicated
            # title_te/body_te columns — so for te feeds, mirror the translation there, not only in
            # the generic state-lang columns the site never queries.
            title_te = title_sl if tgt == "te" else None
            body_te = body_sl if tgt == "te" else None
            ch = hashlib.sha256((src + "|" + title).encode()).hexdigest()[:32]
            stories.append(dict(
                content_hash=ch, category=feed["category"], title_en=title, dek_en=dek, body_en=body_en,
                title_hi=title_hi, body_hi=body_hi, title_te=title_te, body_te=body_te,
                state_lang=tgt, title_sl=title_sl, body_sl=body_sl,
                image_url=img, image_credit=(it.get("source") or "") if img else None,
                city=feed["city"], state=feed["state"], latitude=feed["lat"], longitude=feed["lng"],
                src_url=src, src_publisher=it.get("source") or "", src_lang="en",
                published_at=it.get("published"), status="PUBLISHED"))
            kept += 1; kept_here += 1
            if kept % 1 == 0:
                push(stories); stories = []      # push each story immediately (incremental, nothing lost on interrupt)
            print(f"  KEEP [{feed['category']}/{feed['city']}] {title[:55]}", flush=True)
    n_final = push(stories)
    print(f"cycle done: kept {kept}, dropped {dropped}, final-batch {n_final}", flush=True)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "once"
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    if mode == "loop":
        while True:
            t0 = time.time()
            try:
                cycle(limit)
            except Exception as e:
                print("CYCLE ERROR:", e, flush=True)
            sleep = max(60, 3600 - (time.time() - t0))
            print(f"sleeping {sleep / 60:.0f} min", flush=True)
            time.sleep(sleep)
    else:
        cycle(limit)
