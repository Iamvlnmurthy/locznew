"""Design the whole category tree: parent, name and search vocabulary for every business type.

One pass over all 1,423 business types that appear in the directory, not just the common
ones. For each it produces:

  parent    -- the group a customer would browse under
  name      -- what that business is called in India. The source labels are machine names
               (`gas_station`, `college_university`), and "Gas station" is not a petrol pump.
  keywords  -- the words people actually search, including the Hindi-English mix they type
               ("medical shop", "chemist", "davakhana"), and the question forms an answer
               engine gets asked ("best dentist near me", "24 hour pharmacy").

The keywords matter beyond ranking: they are what the composed description says people look
for, and they are the only vocabulary an unclaimed record has for matching a search that
does not use the category's own name.
"""
import io, json, os, sys, time, urllib.request

KEY = os.environ["SARVAM_KEY"]
API = "https://api.sarvam.ai/v1/chat/completions"
BATCH = 25

PARENTS = json.load(io.open("var/overture/taxonomy.json", encoding="utf-8"))["parents"]

def ask(items):
    prompt = (
        "You are designing the category tree of an Indian local business directory, like "
        "Justdial. A customer must be able to find a business and understand what it is.\n\n"
        "Allowed parent categories (choose one EXACT string from this list):\n"
        + json.dumps(PARENTS, ensure_ascii=False) + "\n\n"
        "For each machine label below, return three things:\n"
        '  "parent"   one of the allowed parents\n'
        '  "name"     what Indians call this business. Plural, sentence case, 2-4 words.\n'
        "             Indian English: 'Petrol pumps' not 'Gas stations'; 'Medical shops' not\n"
        "             'Drugstores'; 'Two-wheeler showrooms' not 'Motorcycle dealers'.\n"
        '  "keywords" 5 to 10 search phrases a real customer would type, including common\n'
        "             Hindi/regional words written in English (chemist, davakhana, kirana),\n"
        "             and natural questions ('best dentist near me', '24 hour medical shop').\n\n"
        + json.dumps(items, ensure_ascii=False) + "\n\n"
        'Reply with ONLY JSON: {"<label>": {"parent": "...", "name": "...", "keywords": ["..."]}}'
    )
    body = json.dumps({"model": "sarvam-105b-conversations", "temperature": 0.2,
                       "max_tokens": 4000,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(API, body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    raw = json.load(urllib.request.urlopen(req, timeout=300))["choices"][0]["message"]["content"]
    return json.loads(raw[raw.find("{"):raw.rfind("}") + 1])

def clean(entry, label):
    """Keep only what is usable. A half-formed category is worse than none."""
    if not isinstance(entry, dict):
        return None
    parent = (entry.get("parent") or "").strip()
    name = (entry.get("name") or "").strip()
    kws = entry.get("keywords") or []
    if parent not in PARENTS:
        return None
    if not name or len(name) > 44 or "_" in name:
        return None
    kws = [k.strip().lower() for k in kws
           if isinstance(k, str) and 2 < len(k.strip()) <= 60][:10]
    return {"leaf": label, "parent": parent, "name": name, "keywords": kws}

def main():
    leaves = json.load(io.open("var/overture/leaf_counts.json", encoding="utf-8"))
    done = {}
    out_path = "var/overture/full_taxonomy.json"
    if os.path.exists(out_path):           # resumable: this is ~60 API calls
        done = {d["leaf"]: d for d in json.load(io.open(out_path, encoding="utf-8"))}
        print(f"resuming with {len(done)} already designed")
    todo = [l for l in leaves if l["leaf"] not in done]
    print(f"{len(todo)} of {len(leaves)} business types to design\n", flush=True)

    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        items = [{"label": l["leaf"], "businesses": l["n"]} for l in chunk]
        try:
            got = ask(items)
        except Exception as e:
            print(f"  batch {i//BATCH}: FAILED {type(e).__name__}", flush=True); continue
        for l in chunk:
            rec = clean(got.get(l["leaf"]), l["leaf"])
            if rec:
                rec["n"] = l["n"]; done[l["leaf"]] = rec
        io.open(out_path, "w", encoding="utf-8").write(
            json.dumps(list(done.values()), ensure_ascii=False, indent=1))
        print(f"  {len(done)}/{len(leaves)} designed", flush=True)
        time.sleep(0.5)

    print(f"\ndone: {len(done)} business types designed")
    for d in list(done.values())[:6]:
        print(f"   {d['leaf']:<26} {d['name']:<24} <{d['parent']}>")
        print(f"       keywords: {', '.join(d['keywords'][:6])}")

main()
