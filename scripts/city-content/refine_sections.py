"""Refine long city-guide sections from raw Wikipedia walls-of-text into short, scannable summaries.

Each prod city_sections row over ~160 words is rewritten to 90-130 words (2-3 short paragraphs)
via gemini-2.5-flash-lite, keeping facts/names/numbers, and written back to `content`. Idempotent:
refined rows fall under the word threshold so a re-run skips them. Originals remain in the staging
locz_cities.db (re-import to restore). sourceUrl/license are untouched (still CC BY-SA / Wikipedia).
"""
import os, sys, io, time, json, requests, psycopg
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# Multi-provider pool — Gemini (20/min each) + Groq (30/min each). Round-robin across all keys so
# combined throughput is the sum. Keys from env (comma-separated), reference not committed.
MIN_WORDS = int(os.environ.get("MIN_WORDS", "160"))
APPLY = "apply" in sys.argv

PROVIDERS = []
for k in filter(None, os.environ.get("GEMINI_KEYS", "").split(",")):
    PROVIDERS.append({"type": "gemini", "key": k.strip(),
                      "model": "gemini-2.5-flash-lite", "interval": 3.2, "next": 0.0})
for k in filter(None, os.environ.get("GROQ_KEYS", "").split(",")):
    PROVIDERS.append({"type": "groq", "key": k.strip(),
                      "model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b"),
                      "interval": 2.1, "next": 0.0})
if not PROVIDERS:
    sys.exit("no providers: set GEMINI_KEYS and/or GROQ_KEYS")

PROMPT = ("Rewrite this city-guide section into a concise, scannable summary for a local readers' "
          "page. Rules: 2-3 SHORT paragraphs, 90-130 words total; keep the most important facts, "
          "names and numbers; plain factual tone; break the wall of text; do NOT add anything not "
          "in the source. Return only the rewritten summary.\n\nSECTION ({title}):\n{body}")


def call(p, prompt):
    """Return (text|None, status_code) for one provider."""
    if p["type"] == "gemini":
        url = ("https://generativelanguage.googleapis.com/v1beta/models/"
               f"{p['model']}:generateContent?key={p['key']}")
        r = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}],
                          "generationConfig": {"temperature": 0.3, "maxOutputTokens": 400}}, timeout=60)
        if r.status_code == 200:
            c = r.json().get("candidates")
            return ((c[0]["content"]["parts"][0]["text"].strip(), 200) if c else (None, 200))
        return (None, r.status_code)
    # gpt-oss is a reasoning model: cap reasoning + leave room so content survives.
    r = requests.post("https://api.groq.com/openai/v1/chat/completions",
                      headers={"Authorization": f"Bearer {p['key']}", "Content-Type": "application/json"},
                      json={"model": p["model"], "temperature": 0.3, "max_tokens": 800,
                            "reasoning_effort": "low",
                            "messages": [{"role": "user", "content": prompt}]}, timeout=60)
    if r.status_code == 200:
        txt = (r.json()["choices"][0]["message"].get("content") or "").strip()
        return ((sane(txt), 200) if txt else (None, 200))
    return (None, r.status_code)


def sane(s):
    # drop lone surrogates / invalid code points so psycopg can store it
    return s.encode("utf-8", "ignore").decode("utf-8", "ignore")


def refine(title, body):
    prompt = PROMPT.format(title=title, body=body)
    for _ in range(len(PROVIDERS) * 3):
        p = min(PROVIDERS, key=lambda x: x["next"])   # soonest-available provider
        wait = p["next"] - time.time()
        if wait > 0:
            time.sleep(wait)
        try:
            text, status = call(p, prompt)
        except Exception:
            p["next"] = time.time() + 10; continue
        if status == 429:
            p["next"] = time.time() + 25            # cool this key, others keep going
            continue
        p["next"] = time.time() + p["interval"]
        if text:
            return text
    raise RuntimeError("all providers failed for this section")


c = psycopg.connect(open("/tmp/locz_dburl").read().strip(), connect_timeout=60, autocommit=True)
rows = c.execute(
    'SELECT s.id, s.title, s.content, ci.name '
    'FROM city_sections s JOIN cities ci ON ci.id = s."cityId" '
    "WHERE array_length(regexp_split_to_array(btrim(s.content), '\\s+'), 1) > %s "
    'ORDER BY ci.name, s."sortOrder"', (MIN_WORDS,)).fetchall()

print(f"{len(rows)} sections over {MIN_WORDS} words to refine (apply={APPLY})", flush=True)
done = failed = 0
for sid, title, body, city in rows:
    try:
        new = refine(title, body)
        if not new or len(new.split()) > len(body.split()):
            failed += 1; continue
        if APPLY:
            c.execute('UPDATE city_sections SET content=%s WHERE id=%s', (new, sid))
        done += 1
        if done % 25 == 0 or not APPLY:
            print(f"  {done}/{len(rows)}  {city}/{title}: {len(body.split())}->{len(new.split())}w", flush=True)
        if not APPLY and done >= 3:
            print("  (dry run — stopping after 3)"); break
    except Exception as e:
        failed += 1
        if failed <= 5:
            print(f"  FAIL {city}/{title}: {str(e)[:60]}", flush=True)

print(f"\ndone {done}, failed {failed}", flush=True)
