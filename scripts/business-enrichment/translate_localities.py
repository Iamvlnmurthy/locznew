"""Transliterate locality names into Telugu and Devanagari.

The neighbourhood is the most specific thing a business page says about where a shop is, and
it sits in the title and the opening sentence of the description. Untranslated, a Telugu
page read "Munirka, ముజఫర్‌పుర్" -- half of one place name in each script.

Only the localities that actually appear on a page. The table holds 155,543 of them; 35,225
are attached to a business. Transliterating the rest would be most of the cost for none of
the benefit, and they can be done later if they ever get used.

Transliteration, not translation, exactly as for cities: these are proper nouns, and every
result is checked to be in the target script before it is written.
"""
import io, json, os, sys, time, urllib.request, psycopg

KEY = os.environ["SARVAM_KEY"]
API = "https://api.sarvam.ai/v1/chat/completions"
DRY = "apply" not in sys.argv
# 20, not 40: a 40-name response overran max_tokens and truncated the JSON, so a whole batch
# came back either unparseable (Hindi) or with most keys missing and counted as "rejected".
BATCH = 20
TARGETS = {"nameTe": ("Telugu", range(0x0C00, 0x0C80)),
           "nameHi": ("Hindi (Devanagari)", range(0x0900, 0x0980))}

def db():
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    return io.open(
        r"C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER--gemini-antigravity-scratch-locz/3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
    ).read().strip()

def ask(names, script_name):
    prompt = (f"Transliterate each Indian neighbourhood or locality name into {script_name} "
              "script. These are proper nouns: write the same name in the other script, do "
              "not translate the meaning, do not add anything. Reply with ONLY a JSON object "
              "mapping each input name to its transliteration.\n\n"
              + json.dumps(names, ensure_ascii=False))
    # 3000 fits a 20-name response with headroom; going higher (8000) reserves against Sarvam's
    # tokens-per-minute cap and trips 429s a few calls in. The truncation was BATCH=40, not this.
    body = json.dumps({"model": "sarvam-105b-conversations", "temperature": 0,
                       "max_tokens": 3000,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(API, body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    raw = json.load(urllib.request.urlopen(req, timeout=240))["choices"][0]["message"]["content"]
    return json.loads(raw[raw.find("{"):raw.rfind("}") + 1])

def in_script(text, block):
    letters = [c for c in text if c.isalpha()]
    if not letters or any("a" <= c.lower() <= "z" for c in letters):
        return False
    return sum(1 for c in letters if ord(c) in block) >= len(letters) / 2

# Only localities a reader can actually reach, most-used first.
#
# The tail is very long and very flat: 35,624 localities are attached to a business, but the
# busiest 5,000 of them account for 79% of those pages, and the busiest 1,000 for half. So
# this is ordered by how many businesses sit in each, and capped -- the remaining 30,000
# would be six times the cost for the last fifth of the benefit, and can be run later by
# raising the cap.
#
# A name is only sent if it looks like a name. "Sector 9 (Chandigarh)" and codes like "10TK"
# are skipped, because asked to transliterate a code the model invents a place: it turned
# "10TK" into "19 పుదూర్", which is in perfect Telugu and completely made up. The script check
# cannot catch that, so the defence has to be at the input.
LIMIT = int(os.environ.get("LOCALITY_LIMIT", "5000"))

IN_USE = """
  SELECT l.id, l.name, count(*) AS n
  FROM localities l
  JOIN addresses a ON a."localityId" = l.id
  JOIN businesses b ON b."addressId" = a.id
  WHERE l."{col}" IS NULL
    AND l.name ~ '^[A-Za-z][A-Za-z .()''-]{{3,}}$'
  GROUP BY l.id, l.name
  ORDER BY n DESC
  LIMIT {limit}"""

def main():
    with psycopg.connect(db(), connect_timeout=60) as c:
        for col, (script_name, block) in TARGETS.items():
            rows = c.execute(IN_USE.format(col=col, limit=LIMIT)).fetchall()
            print(f"\n{script_name}: {len(rows):,} localities in use need a name", flush=True)
            written = rejected = 0
            for i in range(0, len(rows), BATCH):
                chunk = rows[i:i + BATCH]
                got = None
                for attempt in range(4):  # transient 429 (tokens/min) or malformed JSON; back off
                    try:
                        got = ask([r[1] for r in chunk], script_name)
                        break
                    except Exception as e:
                        if attempt == 3:
                            print(f"  batch {i//BATCH}: FAILED {type(e).__name__}", flush=True)
                        else:
                            time.sleep(5 * (attempt + 1))  # 5s, 10s, 15s
                if got is None:
                    continue
                # Carry the source name alongside, only so the sample line below can
                # print a pair that is actually a pair.
                accepted = [(nm, v.strip(), lid) for lid, nm, _n in chunk
                            if (v := got.get(nm) or "") and v.strip() != nm
                            and in_script(v.strip(), block)]
                good = [(v, lid) for _nm, v, lid in accepted]
                rejected += len(chunk) - len(good)
                if good and not DRY:
                    with c.cursor() as cur:
                        cur.executemany(
                            f'UPDATE localities SET "{col}"=%s, "updatedAt"=now() WHERE id=%s', good)
                    c.commit()
                written += len(good)
                if i // BATCH % 20 == 0 or DRY:
                    # This used to print chunk[0][1] -> good[0][0]: the first name
                    # sent, against the first name accepted. When the first was
                    # rejected those are two different localities, and the line read
                    # as a hallucination - "Gurgaon South City II -> బోరా బజార్" -
                    # in a run whose writes were all correct. Print one record.
                    eg = f"  e.g. {accepted[0][0]} -> {accepted[0][1]}" if accepted else ""
                    print(f"  {written:,} written, {rejected:,} rejected{eg}", flush=True)
                if DRY and i >= BATCH * 2:
                    print("  (dry run — stopping after 3 batches)"); break
                time.sleep(0.6)
            print(f"{script_name}: {written:,} written, {rejected:,} rejected", flush=True)

main()
