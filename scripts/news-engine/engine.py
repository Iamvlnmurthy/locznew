"""LocZ News Engine — runs on the GPU box (RTX 5060).

Hourly:  pull (categories x states)  ->  fetch body + og:image  ->  regenerate English in
LocZ tone (local LLM, journalist brief)  ->  INTEGRITY GATE (drop-on-fail)  ->  translate to
Hindi + state language (IndicTrans2)  ->  categorize  ->  POST to VPS (news_stories table).

Everything runs locally and free. The VPS only serves. Interim rule: a story that fails the
integrity gate is DROPPED and we move on (a human reviewer queue replaces the drop later).

Run:  python engine.py once [--limit N]     # one cycle
      python engine.py loop                 # forever, every hour
"""
import base64, json, re, sys, io, time, subprocess, hashlib, html
from urllib.parse import quote
import requests
from bs4 import BeautifulSoup

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

OLLAMA = "http://127.0.0.1:11434/api/generate"
LLM = "qwen2.5:7b-instruct"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
S = requests.Session(); S.headers.update({"User-Agent": UA})

# state -> its language (IndicTrans2 tgt code). Extend to all 30+ states.
STATE_LANG = {
    "Telangana": ("te", "tel_Telu"), "Andhra Pradesh": ("te", "tel_Telu"),
    "Tamil Nadu": ("ta", "tam_Taml"), "Karnataka": ("kn", "kan_Knda"),
    "Maharashtra": ("mr", "mar_Deva"), "West Bengal": ("bn", "ben_Beng"),
    "Kerala": ("ml", "mal_Mlym"), "Gujarat": ("gu", "guj_Gujr"),
}
HI = "hin_Deva"

# Feed matrix: (category, state, city, lat, lng, google-news-query). English only — regional
# comes from translation. Scale = add rows (30 states x ~8 categories). Small set here for a cycle.
def gnews(q, lang="en"):
    return (f"https://news.google.com/rss/search?q={quote(q)}"
            f"&hl={lang}-IN&gl=IN&ceid=IN:{lang}")

FEEDS = [
    ("local",    "Telangana", "Hyderabad", 17.3850, 78.4867, gnews("Hyderabad OR Gachibowli OR Secunderabad")),
    ("business", "Telangana", "Hyderabad", 17.3850, 78.4867, gnews("Hyderabad business OR startup OR IT")),
    ("sports",   "Telangana", "Hyderabad", 17.3850, 78.4867, gnews("Hyderabad sports OR cricket Telangana")),
    ("state",    "Andhra Pradesh", "Vijayawada", 16.5062, 80.6480, gnews("Andhra Pradesh Vijayawada OR Visakhapatnam")),
]

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
    # drop boilerplate / social-embed lines
    paras = [p for p in paras if len(p) > 40 and not re.search(
        r"(subscrib|log ?in|log ?out|a post shared|©|cookie|newsletter)", p, re.I)]
    return "\n".join(paras), img


# ---------- regenerate (LocZ journalist voice) ----------
BRIEF = """You are LocZ's senior news editor, thirty years on the city desk. Rewrite the report
below as an ORIGINAL LocZ story that a busy local reader wants to read.

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
    req = requests.Request  # noqa
    r = S.post(OLLAMA, data=body, headers={"Content-Type": "application/json"}, timeout=timeout)
    return r.json()["response"].strip()


def regenerate(src_body):
    out = ollama(BRIEF + src_body[:5000])
    head = re.search(r"HEADLINE:\s*(.+)", out)
    dek = re.search(r"DEK:\s*(.+)", out)
    body = re.split(r"\n\s*\n", out, 1)
    body_txt = body[1].strip() if len(body) > 1 else out
    body_txt = re.sub(r"^(HEADLINE|DEK):.*$", "", body_txt, flags=re.M).strip()
    return (head.group(1).strip() if head else "", dek.group(1).strip() if dek else "", body_txt)


# ---------- integrity gate (drop-on-fail) ----------
def norm(s):
    return re.sub(r"\s+", " ", s.lower())

def integrity_ok(title, body, src):
    nsrc = norm(src)
    text = title + "\n" + body
    # 1. no fabricated quotes
    for q in re.findall(r"[\"“]([^\"”]{6,})[\"”]", text):
        if norm(q) not in nsrc:
            return False, f"fabricated quote: {q[:40]}"
    # 2. every number / year in the story must exist in the source
    for num in set(re.findall(r"\b\d{2,}\b", text)):
        if num not in re.sub(r"[,\s]", "", src) and num not in src:
            return False, f"invented number: {num}"
    # 3. sane length
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
    import re as _re
    torch = _it2["torch"]; ip = _it2["ip"]; tok = _it2["tok"]; model = _it2["model"]
    sents = [s.strip() for s in _re.split(r"(?<=[.!?])\s+", text) if s.strip()]
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
    p = subprocess.run(
        ["ssh", "onrol", "sudo -u locz python3 /tmp/insert_stories.py"],
        input=payload.encode("utf-8"), capture_output=True, timeout=120)
    sys.stdout.write(p.stdout.decode("utf-8", "replace"))
    if p.returncode != 0:
        sys.stderr.write(p.stderr.decode("utf-8", "replace"))
    return len(stories)


# ---------- one cycle ----------
def cycle(limit=None):
    it2_load()
    print("models ready; starting cycle", flush=True)
    done = kept = dropped = 0
    stories = []
    for cat, state, city, lat, lng, feed_url in FEEDS:
        try:
            items = feedparser_parse(feed_url)
        except Exception as e:
            print(f"feed error {cat}/{city}: {e}"); continue
        for it in items:
            if limit and kept >= limit:
                break
            done += 1
            src = decode_gnews(it["link"])
            if not src:
                dropped += 1; continue
            try:
                body, img = fetch_article(src)
            except Exception:
                dropped += 1; continue
            if len(body) < 200:
                dropped += 1; continue
            try:
                title, dek, body_en = regenerate(body)
            except Exception as e:
                print("regen err", e); dropped += 1; continue
            ok, why = integrity_ok(title, body_en, body)
            if not ok or not title:
                dropped += 1
                print(f"  DROP [{cat}/{city}] {why} :: {title[:50]}")
                continue
            slcode, sltriple = STATE_LANG.get(state, ("hi", HI))
            try:
                body_hi = translate(body_en, HI); title_hi = translate(title, HI)
                body_sl = translate(body_en, sltriple); title_sl = translate(title, sltriple)
            except Exception as e:
                print("translate err", e); dropped += 1; continue
            ch = hashlib.sha256((src + "|" + title).encode()).hexdigest()[:32]
            stories.append(dict(
                content_hash=ch, category=cat, title_en=title, dek_en=dek, body_en=body_en,
                title_hi=title_hi, body_hi=body_hi, title_te=None, body_te=None,
                state_lang=slcode, title_sl=title_sl, body_sl=body_sl,
                image_url=img, image_credit=(it.get("source") or "") if img else None,
                city=city, state=state, latitude=lat, longitude=lng,
                src_url=src, src_publisher=it.get("source") or "", src_lang="en",
                published_at=it.get("published"), status="PUBLISHED"))
            kept += 1
            print(f"  KEEP [{cat}/{city}] {title[:60]}")
        if limit and kept >= limit:
            break
    n = push(stories)
    print(f"cycle done: seen {done}, kept {kept}, dropped {dropped}, pushed {n}", flush=True)


def feedparser_parse(url):
    import feedparser
    d = feedparser.parse(S.get(url, timeout=25).content)
    out = []
    for e in d.entries[:100]:
        out.append({"link": e.get("link"), "title": e.get("title"),
                    "published": e.get("published"),
                    "source": (e.get("source", {}) or {}).get("title", "")})
    return out


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "once"
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    if mode == "loop":
        while True:
            t0 = time.time()
            try:
                cycle(limit)
            except Exception as e:
                print("CYCLE ERROR:", e, flush=True)
            sleep = max(0, 3600 - (time.time() - t0))
            print(f"sleeping {sleep/60:.0f} min", flush=True)
            time.sleep(sleep)
    else:
        cycle(limit)
