"""Fill the Telugu columns for stories that have none (Telugu tab currently falls back to English).
Translates the English title/dek/body into MODERN spoken Telugu via Gemini (parallel, one worker per
key), writes the te columns through lang_io.py over SSH. Resumable via te_backfill_done.txt (:tefill).
"""
import os, sys, json, time, queue, threading, subprocess, requests

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS = [k.strip() for k in os.environ.get(
    "GEMINI_API_KEYS", os.environ.get("GEMINI_API_KEY", "")).split(",") if k.strip()]
MODELS = [m.strip() for m in os.environ.get(
    "GEMINI_MODELS", "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash").split(",") if m.strip()]
_EXHAUSTED = set()
DONE_FILE = os.path.join(HERE, "te_backfill_done.txt")
IO_SCRIPT = os.path.join(HERE, "lang_io.py")
SLEEP = float(os.environ.get("BACKFILL_SLEEP", "4"))
CHUNK = int(os.environ.get("BACKFILL_CHUNK", "20"))
_io_lock = threading.Lock()
_counts = {"done": 0, "skipped": 0}
S = requests.Session()

SYS = ("You are a Telugu news sub-editor for a young Hyderabad readership. TRANSLATE the given "
       "English news fields into clear, MODERN, everyday Telugu people actually speak and read today "
       "— natural flow, common words, short sentences, Telugu script. Do NOT add, drop or change any "
       "fact, name, number, date or place. Return the same fields (title, dek, body) in Telugu.")


def in_te(s):
    """Telugu present AND no other Indic script bleeding in (Gemini sometimes mixes Tamil/etc.)."""
    if not s:
        return False
    has_te = any(0x0C00 <= ord(c) <= 0x0C7F for c in s)
    has_other = any(0x900 <= ord(c) <= 0xD7F and not (0x0C00 <= ord(c) <= 0x0C7F) for c in s)
    return has_te and not has_other


def translate_row(row, key):
    src = {k: row.get(k) for k in ("title", "dek", "body") if row.get(k)}
    if not src:
        return None
    body = json.dumps({
        "system_instruction": {"parts": [{"text": SYS}]},
        "contents": [{"parts": [{"text": json.dumps(src, ensure_ascii=False)}]}],
        "generationConfig": {"temperature": 0.4, "response_mime_type": "application/json"},
    }).encode("utf-8")
    models = [m for m in MODELS if (key, m) not in _EXHAUSTED]
    if not models:
        return "QUOTA"
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
                res = {k: (out.get(k) or "").strip() for k in src if in_te((out.get(k) or ""))}
                return res or None
            except Exception:
                time.sleep(3 * (attempt + 1))
    return "QUOTA" if all((key, m) in _EXHAUSTED for m in MODELS) else None


def ssh_apply(updates):
    if not updates:
        return
    p = subprocess.run(["ssh", "onrol", "sudo -u locz python3 /tmp/lang_io.py apply te"],
                       input=json.dumps(updates, ensure_ascii=False).encode("utf-8"),
                       capture_output=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode("utf-8", "replace")[:300])


def _flush(batch):
    # lang_io apply expects {id,title,dek,body} -> te columns
    ssh_apply([{"id": u["id"], "title": u.get("title"), "dek": u.get("dek"), "body": u.get("body")}
               for u in batch])
    with _io_lock:
        with open(DONE_FILE, "a", encoding="utf-8") as f:
            f.write("".join(f"{u['id']}:tefill\n" for u in batch))
        _counts["done"] += len(batch)
        print(f"    applied {len(batch)} (total {_counts['done']})", flush=True)


def worker(wid, key, q):
    batch = []
    while True:
        try:
            row = q.get_nowait()
        except queue.Empty:
            break
        res = translate_row(row, key)
        if res == "QUOTA":
            print(f"  [w{wid}] key spent — stopping", flush=True); q.put(row); break
        if isinstance(res, dict) and res:
            batch.append({"id": row["id"], **res})
            if len(batch) >= CHUNK:
                _flush(batch); batch = []
        else:
            with _io_lock:
                _counts["skipped"] += 1
        time.sleep(SLEEP)
    if batch:
        _flush(batch)


def main():
    if not KEYS:
        sys.exit("no keys")
    subprocess.run(["ssh", "onrol", "cat > /tmp/lang_io.py"],
                   input=open(IO_SCRIPT, "rb").read(), check=True, timeout=60)
    # dump English source for rows lacking Telugu
    dump = subprocess.run(["ssh", "onrol", "sudo -u locz python3 -c \""
        "import json,sys,psycopg;"
        "c=psycopg.connect(open('/tmp/locz_dburl').read().strip());"
        "cur=c.cursor();"
        "cur.execute('SELECT id::text, title_en, dek_en, body_en FROM news_stories WHERE title_te IS NULL');"
        "print(json.dumps([{'id':r[0],'title':r[1],'dek':r[2],'body':r[3]} for r in cur.fetchall()]))\""],
        capture_output=True, timeout=120)
    rows = json.loads(dump.stdout.decode("utf-8"))
    done = set()
    if os.path.exists(DONE_FILE):
        done = set(x.strip() for x in open(DONE_FILE).read().split() if x.strip())
    todo = [r for r in rows if f"{r['id']}:tefill" not in done]
    print(f"missing Telugu: {len(rows)} | to fill: {len(todo)} | keys: {len(KEYS)} (parallel)", flush=True)
    q = queue.Queue()
    for r in todo:
        q.put(r)
    threads = [threading.Thread(target=worker, args=(i + 1, key, q), daemon=True)
               for i, key in enumerate(KEYS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    print(f"\nDONE. filled {_counts['done']}, skipped {_counts['skipped']}, queue left {q.qsize()}.", flush=True)


if __name__ == "__main__":
    main()
