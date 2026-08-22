"""Build a two-level business taxonomy from what is actually in the directory.

LocZ had 45 flat categories, and 612,623 businesses had no home in them: every bank, every
software company, every diagnostic lab and every cinema was "Other local businesses", while
every computer training institute was filed under "Computer & laptop stores".

The shape here comes from the data rather than from a guess. 1,423 distinct business types
appear in the directory; the 356 that have at least 500 businesses cover 97.1% of them, so
those become subcategories. Anything rarer keeps its parent, which is still more specific
than "Other".

Parents are the existing 45 where they already work -- their slugs are in live URLs -- plus
the ones the gap list showed were missing.

Writes a proposal file. Creating categories and re-filing businesses are separate steps.
"""
import io, json, os, sys, time, urllib.request

KEY = os.environ["SARVAM_KEY"]
API = "https://api.sarvam.ai/v1/chat/completions"
MIN_BUSINESSES = int(os.environ.get("MIN_BUSINESSES", "500"))
BATCH = 40

# Parents that already exist. Their slugs are in indexed URLs, so they keep their names.
EXISTING = [
    "Restaurants & food", "Grocery & kirana", "Hospitals & clinics", "Schools", "Colleges",
    "Education & training", "Tuition & coaching", "Hotels & stays", "Clothing stores",
    "Event services", "Property services", "Automobile services", "Salons & spas",
    "Beauty & wellness", "Medical stores & pharmacies", "Local manufacturers",
    "Petrol stations", "Electronics stores", "Travel services", "Printing & stationery",
    "Bakeries & sweets", "Mobile stores", "Furniture stores", "Jewellery stores",
    "Hardware stores", "Wholesale businesses", "Courier & parcel", "Car repair",
    "Agricultural supplies", "Footwear stores", "Gift stores", "Home services",
    "Pet stores & services", "Tyre & battery stores", "Cleaning services",
    "Electrical stores", "Electrical services", "Bike repair", "Tailoring & boutiques",
    "Repair services", "EV charging stations", "Plumbing services", "Professional services",
    "Computer & laptop stores", "Other local businesses",
]

# Missing parents, each taken from the gap list with the business count that justified it.
NEW = [
    "Banks & ATMs",                 # bank + credit union + bank_or_credit_union ~100,000
    "Finance & insurance",          # financial_service, insurance, broking ~70,000
    "IT & software services",       # software_development, IT company ~26,000
    "Interior design & decor",      # interior_design ~14,600
    "Construction & contractors",   # building_or_construction_service ~12,000
    "Government & public services", # post_office, community_and_government ~25,000
    "Malls & department stores",    # shopping_mall, department_store ~13,000
    "Diagnostic labs & imaging",    # laboratory_testing ~6,900
    "Book & music stores",          # bookstore ~7,300
    "Cinemas & entertainment",      # movie_theater ~5,500
    "Opticians & eyewear",          # eyewear_store ~5,000
    "Home appliances",              # appliance_store ~4,400
    "Libraries & study centres",    # library ~4,500
    "Physiotherapy & rehab",        # physical_therapy ~4,000
    "Advertising & marketing",      # b2b advertising ~3,500
    "Sports & fitness",             # gyms, clubs, martial arts
    "Places of worship",            # temples, mosques, churches, gurudwaras
    "Arts & culture",               # art_gallery, museums, studios
    "Veterinary services",          # veterinarian ~1,600
    "Telecom services",             # telecommunications, ISP ~5,400
    "Legal services",               # lawyers, notaries
    "Security services",            # home_security, guards
    "Waste & sanitation",           # waste management
    "Energy & utilities",           # utility providers
]
PARENTS = EXISTING + NEW

def ask(leaves):
    prompt = (
        "You are organising an Indian local business directory into a two-level menu.\n\n"
        "These are the ONLY allowed parent categories. You MUST answer with one of these "
        "exact strings:\n" + json.dumps(PARENTS, ensure_ascii=False) + "\n\n"
        "For each business type below, choose the parent a customer would look under. "
        "Prefer the most specific parent that genuinely fits. Use 'Other local businesses' "
        "only when nothing else is close.\n\n"
        + json.dumps(leaves, ensure_ascii=False) + "\n\n"
        "Reply with ONLY a JSON object mapping each business type to its parent."
    )
    body = json.dumps({"model": "sarvam-105b-conversations", "temperature": 0,
                       "max_tokens": 3000,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(API, body,
        {"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    raw = json.load(urllib.request.urlopen(req, timeout=240))["choices"][0]["message"]["content"]
    return json.loads(raw[raw.find("{"):raw.rfind("}") + 1])

def main():
    leaves = [l for l in json.load(io.open("var/overture/leaf_counts.json", encoding="utf-8"))
              if l["n"] >= MIN_BUSINESSES]
    print(f"{len(PARENTS)} parents ({len(NEW)} new)")
    print(f"{len(leaves)} subcategories to place\n", flush=True)

    out = {}
    for i in range(0, len(leaves), BATCH):
        chunk = [l["leaf"] for l in leaves[i:i + BATCH]]
        try:
            got = ask(chunk)
        except Exception as e:
            print(f"  batch {i//BATCH}: FAILED {type(e).__name__}", flush=True); continue
        for leaf in chunk:
            pick = (got.get(leaf) or "").strip()
            if pick in PARENTS:
                out[leaf] = pick
        print(f"  {len(out)}/{len(leaves)} placed", flush=True)
        time.sleep(0.6)

    counts = {l["leaf"]: l["n"] for l in leaves}
    io.open("var/overture/taxonomy.json", "w", encoding="utf-8").write(json.dumps(
        {"parents": PARENTS, "new_parents": NEW,
         "subcategories": [{"leaf": k, "parent": v, "n": counts[k]} for k, v in out.items()]},
        ensure_ascii=False, indent=1))
    print(f"\nwrote var/overture/taxonomy.json — {len(out)} subcategories placed")

main()
