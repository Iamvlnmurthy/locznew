"""Translate the business keyword vocabulary into Telugu and Hindi.

Keywords are rendered inside the composed description -- "people look here for dal, rice
and soap". The sentence frame is already Telugu; the terms were not, so a Telugu page read
as a Telugu sentence with English nouns dropped into it.

Translation, not transliteration: "dental clinic" must become the Telugu *for* a dental
clinic, because a reader searches for the thing, not for the English word spelled in Telugu
letters. That is the opposite of what cities needed, and it is why this is a separate job.

Every result is checked to be in the target script before it is written, and anything the
model returns unchanged, empty, or in Latin letters is rejected. A term we cannot verify is
left untranslated, and the description falls back to the English word, which is what those
pages show today anyway.
"""
import io, json, os, sys, time, urllib.request, psycopg

KEY = os.environ["SARVAM_KEY"]
URL = io.open(
    r"C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER--gemini-antigravity-scratch-locz/3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
).read().strip()
API = "https://api.sarvam.ai/v1/chat/completions"
DRY = "apply" not in sys.argv
BATCH = 50

TARGETS = {
    "nameTe": ("Telugu", range(0x0C00, 0x0C80)),
    "nameHi": ("Hindi", range(0x0900, 0x0980)),
}

def ask(terms, script_name):
    prompt = (
        f"Translate each of these business-category terms into {script_name}. "
        "Use the everyday word a customer would actually use when searching for that kind of "
        "shop or service — not a literal word-by-word rendering, and not the English word "
        "written in another script. Keep each translation short.\n\n"
        "Reply with ONLY a JSON object mapping every input term to its translation.\n\n"
        + json.dumps(terms, ensure_ascii=False)
    )
    body = json.dumps({
        "model": "sarvam-105b-conversations", "temperature": 0, "max_tokens": 4000,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(API, body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    raw = json.load(urllib.request.urlopen(req, timeout=240))["choices"][0]["message"]["content"]
    return json.loads(raw[raw.find("{"):raw.rfind("}") + 1])

def in_script(text, block):
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    if any("a" <= c.lower() <= "z" for c in letters):
        return False
    return sum(1 for c in letters if ord(c) in block) >= len(letters) / 2

def main():
    with psycopg.connect(URL, connect_timeout=60) as c:
        terms = [r[0] for r in c.execute(
            "select distinct k from (select unnest(keywords) k from businesses) t order by 1")]
        print(f"{len(terms):,} distinct terms")
        if not DRY:
            with c.cursor() as cur:
                cur.executemany(
                    "INSERT INTO keyword_translations(term) VALUES (%s) ON CONFLICT DO NOTHING",
                    [(t,) for t in terms])
            c.commit()

        for col, (script_name, block) in TARGETS.items():
            todo = [r[0] for r in c.execute(
                f'select term from keyword_translations where "{col}" is null order by term')] \
                if not DRY else terms
            print(f"\n{script_name}: {len(todo):,} to translate", flush=True)
            written = rejected = 0
            for i in range(0, len(todo), BATCH):
                chunk = todo[i:i + BATCH]
                try:
                    got = ask(chunk, script_name)
                except Exception as e:
                    print(f"  batch {i//BATCH}: FAILED {type(e).__name__} {e}", flush=True)
                    continue
                good = []
                for t in chunk:
                    v = (got.get(t) or "").strip()
                    if v and v.lower() != t.lower() and in_script(v, block):
                        good.append((v, t))
                    else:
                        rejected += 1
                if good and not DRY:
                    with c.cursor() as cur:
                        cur.executemany(
                            f'UPDATE keyword_translations SET "{col}"=%s, "updatedAt"=now() WHERE term=%s',
                            good)
                    c.commit()
                written += len(good)
                print(f"  batch {i//BATCH}: {len(good)}/{len(chunk)}"
                      f"  e.g. {good[0][1]} -> {good[0][0]}" if good else
                      f"  batch {i//BATCH}: 0/{len(chunk)}", flush=True)
                time.sleep(1)
            print(f"{script_name}: {written:,} written, {rejected:,} rejected", flush=True)

main()
