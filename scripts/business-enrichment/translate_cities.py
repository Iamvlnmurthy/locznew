"""Transliterate city names into Telugu and Devanagari.

The city name appears in the title, the meta description, the h1 and the JSON-LD of every
city page, every city-by-category hub and every business profile. 632 of 640 cities had no
translation, so those pages read as English behind <html lang="te">.

Transliteration, not translation: "Muzaffarpur" is a proper noun and must come back as
ముజఫర్‌పూర్ -- the same name in another script -- never as a translated phrase.

Every result is checked to be in the target script before it is written. A model that
returns the English string, an empty value, or a stray sentence must not be able to put
that on 640 pages, and a name we cannot verify is left in English, which already renders
correctly.
"""
import io, json, os, sys, time, urllib.request, psycopg

KEY = os.environ["SARVAM_KEY"]
URL = os.environ.get("DATABASE_URL") or io.open(
    r"C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER--gemini-antigravity-scratch-locz/3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
).read().strip()
DRY = "apply" not in sys.argv
BATCH = 40

SCRIPTS = {
    # (column, human name, unicode block that the result must actually be written in)
    "nameTe": ("Telugu", range(0x0C00, 0x0C80)),
    "nameHi": ("Hindi (Devanagari)", range(0x0900, 0x0980)),
}

def ask(names, script_name):
    prompt = (
        f"Transliterate each Indian city name into {script_name} script. "
        "These are proper nouns: write the same name in the other script, do not translate "
        "the meaning and do not add anything. Reply with ONLY a JSON object mapping each "
        "input name to its transliteration.\n\n" + json.dumps(names, ensure_ascii=False)
    )
    body = json.dumps({
        "model": "sarvam-105b-conversations", "temperature": 0, "max_tokens": 3000,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(URL_API, body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    raw = json.load(urllib.request.urlopen(req, timeout=180))["choices"][0]["message"]["content"]
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON in reply")
    return json.loads(raw[start:end + 1])

URL_API = "https://api.sarvam.ai/v1/chat/completions"

def in_script(text, block):
    """At least half the letters must sit in the target block, and none may be ASCII letters."""
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    if any("a" <= c.lower() <= "z" for c in letters):
        return False
    return sum(1 for c in letters if ord(c) in block) >= len(letters) / 2

def main():
    written = skipped = 0
    with psycopg.connect(URL, connect_timeout=60) as c:
        for col, (script_name, block) in SCRIPTS.items():
            rows = c.execute(
                f'SELECT id, name FROM cities WHERE "{col}" IS NULL ORDER BY name'
            ).fetchall()
            print(f"\n{script_name}: {len(rows)} cities need a name", flush=True)
            for i in range(0, len(rows), BATCH):
                chunk = rows[i:i + BATCH]
                names = [r[1] for r in chunk]
                try:
                    got = ask(names, script_name)
                except Exception as e:
                    print(f"  batch {i // BATCH}: FAILED {type(e).__name__} {e}", flush=True)
                    continue
                good = []
                for cid, name in chunk:
                    v = (got.get(name) or "").strip()
                    if v and in_script(v, block) and v != name:
                        good.append((v, cid))
                    else:
                        skipped += 1
                if good and not DRY:
                    with c.cursor() as cur:
                        cur.executemany(
                            f'UPDATE cities SET "{col}"=%s, "updatedAt"=now() WHERE id=%s', good)
                    c.commit()
                written += len(good)
                print(f"  batch {i // BATCH}: {len(good)}/{len(chunk)} accepted"
                      f"{' (dry run)' if DRY else ''}", flush=True)
                for v, cid in good[:2]:
                    print(f"      e.g. {dict(chunk).get(cid, '')} -> {v}")
                time.sleep(1)
    print(f"\n{'would write' if DRY else 'wrote'} {written}; rejected {skipped}")

main()
