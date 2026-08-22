"""Give every subcategory a name a customer would actually use.

The types come from a map-data taxonomy, so their labels are machine names: `gas_station`,
`college_university`, `party_and_event_planning`. Replacing the underscores gives "Gas
station" and "College university", which is not what anyone in India calls a petrol pump or
a college, and it reads as scraped data rather than a directory somebody built.

So the names are written rather than derived. Indian English throughout: petrol pump, not
gas station; medical shop, not drugstore; two-wheeler, not motorbike.
"""
import io, json, os, sys, time, urllib.request

KEY = os.environ["SARVAM_KEY"]
API = "https://api.sarvam.ai/v1/chat/completions"
BATCH = 35

def ask(items):
    prompt = (
        "You are naming the categories of an Indian local business directory, like Justdial.\n\n"
        "Each input is a machine label from a map dataset, with its parent category for "
        "context. Give the name an Indian customer would use when looking for that kind of "
        "business.\n\n"
        "Rules:\n"
        "- Indian English: 'Petrol pumps' not 'Gas stations'; 'Medical shops' not "
        "'Drugstores'; 'Two-wheeler showrooms' not 'Motorcycle dealers'.\n"
        "- Plural, sentence case, 2 to 4 words. No underscores, no ampersands.\n"
        "- Name the business, not the activity: 'Sweet shops', not 'Selling sweets'.\n"
        "- It must be more specific than the parent, and must not simply repeat it.\n\n"
        + json.dumps(items, ensure_ascii=False) + "\n\n"
        "Reply with ONLY a JSON object mapping each machine label to its name."
    )
    body = json.dumps({"model": "sarvam-105b-conversations", "temperature": 0.2,
                       "max_tokens": 3000,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(API, body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    raw = json.load(urllib.request.urlopen(req, timeout=240))["choices"][0]["message"]["content"]
    return json.loads(raw[raw.find("{"):raw.rfind("}") + 1])

def acceptable(name, leaf, parent):
    if not name or len(name) > 44 or "_" in name:
        return False
    words = name.split()
    if not (1 <= len(words) <= 5):
        return False
    # must not just restate the parent
    return name.strip().lower().rstrip("s") != parent.lower().rstrip("s")

def main():
    tax = json.load(io.open("var/overture/taxonomy.json", encoding="utf-8"))
    subs = tax["subcategories"]
    print(f"naming {len(subs)} subcategories\n", flush=True)
    named, rejected = {}, 0
    for i in range(0, len(subs), BATCH):
        chunk = subs[i:i + BATCH]
        items = [{"type": s["leaf"], "parent": s["parent"]} for s in chunk]
        try:
            got = ask(items)
        except Exception as e:
            print(f"  batch {i//BATCH}: FAILED {type(e).__name__}", flush=True); continue
        for s in chunk:
            v = (got.get(s["leaf"]) or "").strip()
            if acceptable(v, s["leaf"], s["parent"]):
                named[s["leaf"]] = v
            else:
                rejected += 1
        print(f"  {len(named)}/{len(subs)} named, {rejected} rejected", flush=True)
        time.sleep(0.6)
    for s in subs:
        s["display"] = named.get(s["leaf"])
    io.open("var/overture/taxonomy.json", "w", encoding="utf-8").write(
        json.dumps(tax, ensure_ascii=False, indent=1))
    print(f"\nnamed {len(named)}, rejected {rejected}")
    for s in subs[:12]:
        print(f"   {s['leaf']:<32} -> {s.get('display')}")

main()
