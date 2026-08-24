"""Transliterate address landmarks into Telugu and Devanagari.

The landmark is a proper noun the composed description drops into the reader's sentence
("{landmark} దగ్గర ఉంది"). Left in English it breaks a Telugu or Hindi page mid-sentence:
"... Cyberabad Women Police Station దగ్గర ఉంది". This fills addresses.landmarkTe/landmarkHi;
the API's describeBusiness then picks the reader's script (mirrors localities.nameTe/nameHi).

Landmarks are a denormalised free-text column on 1.89M addresses but only 386,888 distinct
strings, and the busiest are shared temples/hospitals/stations. So each DISTINCT landmark is
transliterated once and written to every address that carries it, ordered by how many
businesses share it and capped — the head is where the coverage is (top 50k distinct ≈ 69%
of businesses with a landmark).

Transliteration, not translation, exactly as for localities: proper nouns, and every result
is validated to be MAJORITY target-script before it is written (a minority of Latin — Roman
numerals, "H.O", acronyms — is correct and kept).

Run:  SARVAM_KEY=... DATABASE_URL=... LANDMARK_LIMIT=50000 python3 translate_landmarks.py apply
"""
import json, os, sys, time, urllib.request, psycopg

KEY = os.environ["SARVAM_KEY"]
API = "https://api.sarvam.ai/v1/chat/completions"
DRY = "apply" not in sys.argv
BATCH = 20
LIMIT = int(os.environ.get("LANDMARK_LIMIT", "50000"))
TARGETS = {"landmarkTe": ("Telugu", range(0x0C00, 0x0C80)),
           "landmarkHi": ("Hindi (Devanagari)", range(0x0900, 0x0980))}


def db():
    return os.environ["DATABASE_URL"]


def ask(names, script_name):
    prompt = (f"Transliterate each Indian place or landmark name into {script_name} script. "
              "These are proper nouns (temples, hospitals, stations, malls): write the same name "
              "in the other script, do not translate the meaning, do not add anything. Reply with "
              "ONLY a JSON object mapping each input name to its transliteration.\n\n"
              + json.dumps(names, ensure_ascii=False))
    body = json.dumps({"model": "sarvam-105b-conversations", "temperature": 0,
                       "max_tokens": 3000,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(API, body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    raw = json.load(urllib.request.urlopen(req, timeout=240))["choices"][0]["message"]["content"]
    return json.loads(raw[raw.find("{"):raw.rfind("}") + 1])


def in_script(text, block):
    # Majority of letters in the target script — a minority of Latin (Roman numerals, "H.O",
    # acronyms) is a correct transliteration and kept; a mostly-untransliterated string fails.
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    return sum(1 for c in letters if ord(c) in block) >= len(letters) / 2


# A landmark worth sending: contains a real word, most-shared first. Codes and pure numbers are
# skipped — asked to transliterate a code the model invents a place.
IN_USE = """
  SELECT a.landmark, count(*) AS n
  FROM addresses a JOIN businesses b ON b."addressId" = a.id
  WHERE a.landmark IS NOT NULL AND a."{col}" IS NULL
    AND a.landmark ~ '[A-Za-z]{{3,}}'
  GROUP BY a.landmark
  ORDER BY n DESC
  LIMIT {limit}"""


def main():
    with psycopg.connect(db(), connect_timeout=60) as c:
        for col, (script_name, block) in TARGETS.items():
            rows = c.execute(IN_USE.format(col=col, limit=LIMIT)).fetchall()
            print(f"\n{script_name}: {len(rows):,} distinct landmarks need a name", flush=True)
            written = rejected = updated = 0
            for i in range(0, len(rows), BATCH):
                chunk = rows[i:i + BATCH]
                got = None
                for attempt in range(4):  # transient 429 (tokens/min) or malformed JSON; back off
                    try:
                        got = ask([r[0] for r in chunk], script_name)
                        break
                    except Exception as e:
                        if attempt == 3:
                            print(f"  batch {i//BATCH}: FAILED {type(e).__name__}", flush=True)
                        else:
                            time.sleep(5 * (attempt + 1))
                if got is None:
                    continue
                accepted = [(lm, v.strip()) for lm, _n in chunk
                            if (v := got.get(lm) or "") and v.strip() != lm
                            and in_script(v.strip(), block)]
                rejected += len(chunk) - len(accepted)
                written += len(accepted)
                if accepted and not DRY:
                    with c.cursor() as cur:
                        for lm, v in accepted:
                            cur.execute(
                                f'UPDATE addresses SET "{col}"=%s, "updatedAt"=now() '
                                f'WHERE landmark=%s AND "{col}" IS NULL', (v, lm))
                            updated += cur.rowcount
                    c.commit()
                if i // BATCH % 20 == 0 or DRY:
                    eg = f"  e.g. {accepted[0][0]} -> {accepted[0][1]}" if accepted else ""
                    print(f"  {written:,} distinct written ({updated:,} addresses), "
                          f"{rejected:,} rejected{eg}", flush=True)
                if DRY and i >= BATCH * 2:
                    print("  (dry run — stopping after 3 batches)"); break
                time.sleep(0.6)
            print(f"{script_name}: {written:,} distinct written, {updated:,} addresses, "
                  f"{rejected:,} rejected", flush=True)


main()
