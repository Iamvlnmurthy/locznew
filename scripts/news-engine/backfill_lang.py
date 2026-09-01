"""Modern-language backfill, generalised over all Indic languages LocZ serves. Rewrites the
title/dek/body of a language column-set into modern, spoken language via Gemini (parallel, one
worker per key). Runs on the LOCAL box; reads/writes prod through lang_io.py over SSH.

  set GEMINI_API_KEYS=k1,k2,...
  python backfill_lang.py --suffix hi                 # Hindi columns (state_lang=hi)
  python backfill_lang.py --suffix sl --langs kn,ta   # generic state-lang cols, these languages
  python backfill_lang.py --suffix sl                 # all non-hi/te state languages

Resumable: applied ids are recorded in te_backfill_done.txt (shared ledger) and skipped. Per-row
fail-safe: any refine/parse error, or output not in the target script, leaves that row untouched.
"""
import os, sys, json, time, queue, threading, subprocess, requests

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS = [k.strip() for k in os.environ.get(
    "GEMINI_API_KEYS", os.environ.get("GEMINI_API_KEY", "")).split(",") if k.strip()]
MODELS = [m.strip() for m in os.environ.get(
    "GEMINI_MODELS", "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash").split(",") if m.strip()]
_EXHAUSTED = set()
DONE_FILE = os.path.join(HERE, "te_backfill_done.txt")   # shared ledger across all languages
IO_SCRIPT = os.path.join(HERE, "lang_io.py")
SLEEP = float(os.environ.get("BACKFILL_SLEEP", "4"))
CHUNK = int(os.environ.get("BACKFILL_CHUNK", "20"))
_io_lock = threading.Lock()
_counts = {"refined": 0, "skipped": 0}
S = requests.Session()

# state_lang -> (language name, Unicode block for the "is this the right script" guard)
LANGS = {
    "hi": ("Hindi", (0x0900, 0x097F)), "mr": ("Marathi", (0x0900, 0x097F)),
    "te": ("Telugu", (0x0C00, 0x0C7F)), "kn": ("Kannada", (0x0C80, 0x0CFF)),
    "ta": ("Tamil", (0x0B80, 0x0BFF)), "ml": ("Malayalam", (0x0D00, 0x0D7F)),
    "bn": ("Bengali", (0x0980, 0x09FF)), "as": ("Assamese", (0x0980, 0x09FF)),
    "gu": ("Gujarati", (0x0A80, 0x0AFF)), "or": ("Odia", (0x0B00, 0x0B7F)),
    "pa": ("Punjabi", (0x0A00, 0x0A7F)),
}


def prompt_for(lang):
    name = LANGS[lang][0]
    return (f"You are a {name} news sub-editor for a young Indian readership. Rewrite each {name} "
            f"field into clear, MODERN, everyday {name} people actually speak and read today — "
            f"natural flow, common words, short sentences. Keep {name} script. Do NOT translate to "
            f"English. Do NOT add, drop or change any fact, name, number, date or place. Return the "
            f"same three fields (title, dek, body).")


def in_script(s, rng):
    lo, hi = rng
    return bool(s) and any(lo <= ord(ch) <= hi for ch in s)


def refine(row, key):
    lang = row.get("state_lang")
    if lang not in LANGS:
        return None
    src = {k: row.get(k) for k in ("title", "dek", "body") if row.get(k)}
    if not src:
        return None
    body = json.dumps({
        "system_instruction": {"parts": [{"text": prompt_for(lang)}]},
        "contents": [{"parts": [{"text": json.dumps(src, ensure_ascii=False)}]}],
        "generationConfig": {"temperature": 0.4, "response_mime_type": "application/json"},
    }).encode("utf-8")
    models = [m for m in MODELS if (key, m) not in _EXHAUSTED]
    if not models:
        return "QUOTA"
    rng = LANGS[lang][1]
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        for attempt in range(3):
            try:
                r = S.post(url, params={"key": key}, data=body,
                           headers={"Content-Type": "application/json"}, timeout=90)
                if r.status_code == 429:
                    _EXHAUSTED.add((key, model)); break
                r.raise_for_status()
                out = json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])
                res = {}
                for k in src:
                    v = (out.get(k) or "").strip()
                    if in_script(v, rng):
                        res[k] = v
                return res or None
            except Exception:
                time.sleep(3 * (attempt + 1))
    return "QUOTA" if all((key, m) in _EXHAUSTED for m in MODELS) else None


def ssh_apply(suffix, updates):
    if not updates:
        return
    p = subprocess.run(["ssh", "onrol", f"sudo -u locz python3 /tmp/lang_io.py apply {suffix}"],
                       input=json.dumps(updates, ensure_ascii=False).encode("utf-8"),
                       capture_output=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode("utf-8", "replace")[:300])


def _flush(suffix, batch):
    ssh_apply(suffix, batch)
    with _io_lock:
        with open(DONE_FILE, "a", encoding="utf-8") as f:
            f.write("".join(f"{u['id']}:{suffix}\n" for u in batch))
        _counts["refined"] += len(batch)
        print(f"    applied {len(batch)} (total refined {_counts['refined']})", flush=True)


def worker(wid, key, q, suffix):
    batch = []
    while True:
        try:
            row = q.get_nowait()
        except queue.Empty:
            break
        res = refine(row, key)
        if res == "QUOTA":
            print(f"  [w{wid}] key spent — stopping", flush=True)
            q.put(row); break
        if isinstance(res, dict) and res:
            batch.append({"id": row["id"], **res})
            if len(batch) >= CHUNK:
                _flush(suffix, batch); batch = []
        else:
            with _io_lock:
                _counts["skipped"] += 1
        time.sleep(SLEEP)
    if batch:
        _flush(suffix, batch)


def main():
    if not KEYS:
        sys.exit("no keys: set GEMINI_API_KEYS")
    suffix = "sl"
    langs = ""
    if "--suffix" in sys.argv:
        suffix = sys.argv[sys.argv.index("--suffix") + 1]
    if "--langs" in sys.argv:
        langs = sys.argv[sys.argv.index("--langs") + 1]

    subprocess.run(["ssh", "onrol", "cat > /tmp/lang_io.py"],
                   input=open(IO_SCRIPT, "rb").read(), check=True, timeout=60)
    cmd = f"sudo -u locz python3 /tmp/lang_io.py dump {suffix}"
    if langs:
        cmd += f" {langs}"
    dump = subprocess.run(["ssh", "onrol", cmd], capture_output=True, timeout=120)
    rows = json.loads(dump.stdout.decode("utf-8"))
    # For the generic sl column, skip te/hi rows (served from their own dedicated columns).
    if suffix == "sl":
        rows = [r for r in rows if r.get("state_lang") not in ("te", "hi")]
    done = set()
    if os.path.exists(DONE_FILE):
        done = set(x.strip() for x in open(DONE_FILE).read().split() if x.strip())
    # done-file is shared; only skip a row if THIS suffix already applied it. Tag ids by suffix.
    todo = [r for r in rows if f"{r['id']}:{suffix}" not in done]
    print(f"suffix={suffix} langs={langs or 'all'} | rows: {len(rows)} | to refine: {len(todo)} "
          f"| keys: {len(KEYS)} (parallel)", flush=True)

    q = queue.Queue()
    for r in todo:
        q.put(r)
    threads = [threading.Thread(target=worker, args=(i + 1, key, q, suffix), daemon=True)
               for i, key in enumerate(KEYS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    print(f"\nDONE {suffix}. refined {_counts['refined']}, skipped {_counts['skipped']}, "
          f"queue left {q.qsize()}.", flush=True)


if __name__ == "__main__":
    main()
