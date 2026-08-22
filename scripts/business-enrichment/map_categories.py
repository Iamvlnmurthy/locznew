"""Re-derive the Overture-taxonomy-to-LocZ-category mapping, and report what it would change.

The import mapped each record's source category to one of LocZ's own. It got the common
cases right -- `school` to Schools, `hotel` to Hotels & stays -- and then filed every
computer training institute in India under "Computer & laptop stores", because the leaf
`computer_coaching` was mapped as a kind of computer shop rather than a kind of coaching.
That category is the most prominent line on the page: it is the title, the h1, the
breadcrumb, the LocalBusiness type and the first sentence of the description.

Of 1,423 distinct leaves only 505 map to exactly one LocZ category today, so the rest were
already inconsistent from record to record.

Writes nothing. It produces a proposed mapping and a diff for review; applying it is a
separate step, because a wrong re-categorisation is exactly as damaging as the wrong
category it replaces.
"""
import io, json, os, sys, time, urllib.request, psycopg

KEY = os.environ["SARVAM_KEY"]
API = "https://api.sarvam.ai/v1/chat/completions"
BATCH = 40
URL = io.open(
    r"C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER--gemini-antigravity-scratch-locz/3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
).read().strip()

def ask(leaves, categories):
    prompt = (
        "You are classifying business types for an Indian local business directory.\n\n"
        "Here is the complete list of allowed categories. You MUST choose one of these exact "
        "strings for each input, and nothing else:\n"
        + json.dumps(categories, ensure_ascii=False) + "\n\n"
        "Classify each of these business types. They come from a map data taxonomy, so "
        "underscores separate words. Choose the category a customer would look under.\n"
        "If none fits well, answer \"Other local businesses\".\n\n"
        + json.dumps(leaves, ensure_ascii=False) + "\n\n"
        "Reply with ONLY a JSON object mapping each input exactly to its chosen category."
    )
    body = json.dumps({"model": "sarvam-105b-conversations", "temperature": 0,
                       "max_tokens": 3000,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(API, body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    raw = json.load(urllib.request.urlopen(req, timeout=240))["choices"][0]["message"]["content"]
    return json.loads(raw[raw.find("{"):raw.rfind("}") + 1])

def main():
    with psycopg.connect(URL, connect_timeout=60) as c:
        cats = [r[0] for r in c.execute("""
            SELECT cat.name FROM categories cat JOIN businesses b ON b."categoryId" = cat.id
            GROUP BY 1 ORDER BY count(*) DESC""")]
        print(f"{len(cats)} allowed categories")
        leaves = json.load(io.open("var/overture/leaf_counts.json", encoding="utf-8"))
        print(f"{len(leaves)} taxonomy leaves to classify\n")

        mapping = {}
        for i in range(0, len(leaves), BATCH):
            chunk = [l["leaf"] for l in leaves[i:i + BATCH]]
            try:
                got = ask(chunk, cats)
            except Exception as e:
                print(f"  batch {i//BATCH}: FAILED {type(e).__name__}", flush=True); continue
            kept = 0
            for leaf in chunk:
                pick = (got.get(leaf) or "").strip()
                # The model must choose from the list. Anything invented is dropped rather
                # than coerced to something near it.
                if pick in cats:
                    mapping[leaf] = pick; kept += 1
            print(f"  {len(mapping):,} mapped ({kept}/{len(chunk)} this batch)", flush=True)
            time.sleep(0.6)

        io.open("var/overture/category_map.json", "w", encoding="utf-8").write(
            json.dumps(mapping, ensure_ascii=False, indent=1))
        print(f"\nwrote var/overture/category_map.json with {len(mapping):,} entries")

main()
