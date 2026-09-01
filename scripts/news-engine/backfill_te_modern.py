"""One-off backfill: rewrite existing news_stories Telugu (title_te/dek_te/body_te) into modern,
spoken Telugu with Gemini. Runs on the LOCAL GPU box (holds the keys + internet); reads/writes prod
through te_modern_io.py over SSH (same path the engine already uses to write).

  set GEMINI_API_KEYS=k1,k2,...   (run_engine.bat sets it; falls back to GEMINI_API_KEY)
  python backfill_te_modern.py            # do it (parallel: one worker per key)
  python backfill_te_modern.py --limit 3  # small test

Parallel: each key gets its own worker thread and its own free daily quota, so N keys ≈ N x speed.
Safe to re-run: ids already done are recorded in te_backfill_done.txt and skipped. Per-row fail-safe:
any refine/parse error leaves that story's Telugu untouched. Each worker self-paces for the RPM cap.
"""
import os, sys, json, time, queue, threading, subprocess, requests

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS = [k.strip() for k in os.environ.get(
    "GEMINI_API_KEYS", os.environ.get("GEMINI_API_KEY", "")).split(",") if k.strip()]
MODELS = [m.strip() for m in os.environ.get(
    "GEMINI_MODELS", "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash").split(",") if m.strip()]
_EXHAUSTED = set()   # (key,model) pairs that returned 429 today — skip for the rest of the run
DONE_FILE = os.path.join(HERE, "te_backfill_done.txt")
IO_SCRIPT = os.path.join(HERE, "te_modern_io.py")
SLEEP = float(os.environ.get("BACKFILL_SLEEP", "4"))   # per-worker pause -> ~15 req/min/key (RPM cap)
CHUNK = int(os.environ.get("BACKFILL_CHUNK", "20"))    # each worker applies to prod every N rows
_io_lock = threading.Lock()                            # serialize done-file writes + counters
_counts = {"refined": 0, "skipped": 0}
S = requests.Session()

SYS = ("You are a Telugu news sub-editor for a young Hyderabad readership. Rewrite each Telugu field "
       "into clear, MODERN, everyday Telugu people actually speak and read today — natural flow, "
       "common words, short sentences. Keep Telugu script. Do NOT translate to English. Do NOT add, "
       "drop or change any fact, name, number, date or place. Return the same three fields.")


def refine(row, key):
    """title_te/dek_te/body_te -> modern Telugu dict, None (skip), or 'QUOTA' if this key is spent."""
    src = {k: row.get(k) for k in ("title_te", "dek_te", "body_te") if row.get(k)}
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
                if r.status_code == 429:         # daily quota for this (key,model) spent -> rotate
                    _EXHAUSTED.add((key, model)); break
                r.raise_for_status()
                out = json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])
                res = {}
                for k in src:
                    v = (out.get(k) or "").strip()
                    if v and any("ఀ" <= ch <= "౿" for ch in v):
                        res[k] = v
                return res or None
            except Exception:
                time.sleep(3 * (attempt + 1))
    return "QUOTA" if all((key, m) in _EXHAUSTED for m in MODELS) else None


def ssh_apply(updates):
    if not updates:
        return
    p = subprocess.run(["ssh", "onrol", "sudo -u locz python3 /tmp/te_modern_io.py apply"],
                       input=json.dumps(updates, ensure_ascii=False).encode("utf-8"),
                       capture_output=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode("utf-8", "replace")[:300])


def _flush(batch):
    """Apply a worker's batch to prod and record the ids as done (thread-safe)."""
    ssh_apply(batch)
    with _io_lock:
        with open(DONE_FILE, "a", encoding="utf-8") as f:
            f.write("".join(f"{u['id']}\n" for u in batch))
        _counts["refined"] += len(batch)
        print(f"    applied {len(batch)} (total refined {_counts['refined']})", flush=True)


def worker(wid, key, q):
    batch = []
    while True:
        try:
            row = q.get_nowait()
        except queue.Empty:
            break
        res = refine(row, key)
        if res == "QUOTA":
            print(f"  [w{wid}] key spent — stopping this worker", flush=True)
            q.put(row)                            # hand the row back for another worker/day
            break
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
        sys.exit("no keys: set GEMINI_API_KEYS")
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    subprocess.run(["ssh", "onrol", "cat > /tmp/te_modern_io.py"],
                   input=open(IO_SCRIPT, "rb").read(), check=True, timeout=60)
    dump = subprocess.run(["ssh", "onrol", "sudo -u locz python3 /tmp/te_modern_io.py dump"],
                          capture_output=True, timeout=120)
    rows = json.loads(dump.stdout.decode("utf-8"))
    done = set()
    if os.path.exists(DONE_FILE):
        done = set(x.strip() for x in open(DONE_FILE).read().split() if x.strip())
    todo = [r for r in rows if r["id"] not in done]
    if limit:
        todo = todo[:limit]
    print(f"te rows: {len(rows)} | already done: {len(done)} | to refine: {len(todo)} "
          f"| keys: {len(KEYS)} (parallel)", flush=True)

    q = queue.Queue()
    for r in todo:
        q.put(r)
    threads = [threading.Thread(target=worker, args=(i + 1, key, q), daemon=True)
               for i, key in enumerate(KEYS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    print(f"\nDONE. refined {_counts['refined']}, skipped {_counts['skipped']}, "
          f"remaining in queue {q.qsize()} (re-run to finish any left).", flush=True)


if __name__ == "__main__":
    main()
