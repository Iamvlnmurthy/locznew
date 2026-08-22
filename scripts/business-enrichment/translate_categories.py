"""Translate the category names that had no existing translation.

1,375 subcategories were created and 88% took their Telugu and Hindi names straight from
keyword_translations, because the subcategory names and the keyword vocabulary are largely
the same words. The rest are new phrasings -- "Education centres", "Two-wheeler showrooms" --
and showed in English on a Telugu page, which is the most visible field on the profile.

Translated, not transliterated: a category names a kind of business, and a reader searches
for the thing.
"""
import io, json, os, sys, time, urllib.request, psycopg

KEY = os.environ["SARVAM_KEY"]
API = "https://api.sarvam.ai/v1/chat/completions"
URL = io.open(
    r"C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER--gemini-antigravity-scratch-locz/3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
).read().strip()
BATCH = 40
TARGETS = {"nameTe": ("Telugu", range(0x0C00, 0x0C80)),
           "nameHi": ("Hindi", range(0x0900, 0x0980))}

def ask(names, script_name):
    prompt = (f"Translate each Indian business-category name into {script_name}. Use the "
              "everyday word a customer would use when looking for that kind of business, "
              "not a literal word-by-word rendering. Keep it short.\n\n"
              "Reply with ONLY a JSON object mapping each input to its translation.\n\n"
              + json.dumps(names, ensure_ascii=False))
    body = json.dumps({"model": "sarvam-105b-conversations", "temperature": 0,
                       "max_tokens": 3000,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(API, body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    raw = json.load(urllib.request.urlopen(req, timeout=240))["choices"][0]["message"]["content"]
    return json.loads(raw[raw.find("{"):raw.rfind("}") + 1])

def in_script(t, block):
    letters = [c for c in t if c.isalpha()]
    if not letters or any("a" <= c.lower() <= "z" for c in letters):
        return False
    return sum(1 for c in letters if ord(c) in block) >= len(letters) / 2

def main():
    with psycopg.connect(URL, connect_timeout=90) as c:
        for col, (script_name, block) in TARGETS.items():
            rows = c.execute(f'SELECT id, name FROM categories WHERE "{col}" IS NULL ORDER BY name').fetchall()
            print(f"\n{script_name}: {len(rows)} categories need a name", flush=True)
            written = rejected = 0
            for i in range(0, len(rows), BATCH):
                chunk = rows[i:i + BATCH]
                try:
                    got = ask([r[1] for r in chunk], script_name)
                except Exception as e:
                    print(f"  batch {i//BATCH}: FAILED {type(e).__name__}", flush=True); continue
                good = [(v.strip(), cid) for cid, nm in chunk
                        if (v := got.get(nm) or "") and in_script(v.strip(), block)]
                rejected += len(chunk) - len(good)
                if good:
                    with c.cursor() as cur:
                        cur.executemany(f'UPDATE categories SET "{col}"=%s, "updatedAt"=now() WHERE id=%s', good)
                    c.commit()
                written += len(good)
                print(f"  {written} written, {rejected} rejected", flush=True)
                time.sleep(0.5)
            print(f"{script_name}: {written} written, {rejected} rejected", flush=True)

main()
