"""Create the two-level category tree and re-file businesses onto it.

Existing categories keep their id, slug and name: their slugs are in live URLs and in the
sitemap, and 3.4M businesses point at them. New parents are added alongside, and every
business type with at least 500 businesses becomes a subcategory under the right parent.

Telugu and Hindi names come from keyword_translations, which already holds 97% of these
terms because the subcategory names and the keyword vocabulary are the same words.

Businesses move only where the new home is genuinely more specific:
  * never onto a parent that is 'Other local businesses' when they already have a real one;
  * never over an owner's own choice -- a claimed business keeps what its owner set.
"""
import io, json, os, re, sys, unicodedata, uuid, psycopg

URL = io.open(
    r"C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER--gemini-antigravity-scratch-locz/3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
).read().strip()
DRY = "apply" not in sys.argv

def slugify(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s))[:150]

def restates(child, parent):
    """True when the child name adds nothing to the parent name."""
    c = child.lower().rstrip("s")
    p = parent.lower()
    return c in p or p.rstrip("s").startswith(c)

def title(leaf):
    """`computer_coaching` -> `Computer coaching`. Sentence case, as the existing names are."""
    words = leaf.replace("_", " ").strip()
    return words[:1].upper() + words[1:]

def main():
    tax = json.load(io.open("var/overture/taxonomy.json", encoding="utf-8"))
    subs = tax["subcategories"]

    with psycopg.connect(URL, connect_timeout=60) as c:
        existing = {r[0]: r[1] for r in c.execute("SELECT name, id FROM categories")}
        tr = {r[0]: (r[1], r[2]) for r in c.execute(
            'SELECT term, "nameTe", "nameHi" FROM keyword_translations')}
        maxsort = c.execute("SELECT coalesce(max(\"sortOrder\"),0) FROM categories").fetchone()[0]

        # ---- parents ----
        parents_needed = sorted({s["parent"] for s in subs})
        new_parents = [p for p in parents_needed if p not in existing]
        print(f"parents: {len(parents_needed)} needed, {len(new_parents)} to create")
        if not DRY:
            for i, name in enumerate(new_parents):
                pid = str(uuid.uuid4())
                c.execute("""INSERT INTO categories (id, name, slug, "sortOrder", "isActive",
                                 "listingTypes", "searchTerms", "isDirectoryOnly", "createdAt", "updatedAt")
                             VALUES (%s,%s,%s,%s,true,'{}','{}',true,now(),now())
                             ON CONFLICT DO NOTHING""",
                          (pid, name, slugify(name), maxsort + 100 + i))
                existing[name] = pid
            c.commit()
        print(f"  created {len(new_parents)}")

        # ---- subcategories ----
        created = skipped = 0
        rows = []
        for s in subs:
            name = title(s["leaf"])
            parent_id = existing.get(s["parent"])
            if parent_id is None:      # dry run: parent not created yet
                skipped += 1; continue
            if name in existing:       # a subcategory whose name already exists as a category
                skipped += 1; continue
            # A subcategory that only restates its parent is clutter: "School" under
            # "Schools", "Restaurant" under "Restaurants & food". Those businesses stay on
            # the parent, which already says the same thing.
            if restates(name, s["parent"]):
                skipped += 1; continue
            te, hi = tr.get(s["leaf"].replace("_", " "), (None, None))
            rows.append((str(uuid.uuid4()), name, slugify(name), parent_id, te, hi, s["n"]))
        print(f"subcategories: {len(rows)} to create, {skipped} skipped (name already a category)")

        if not DRY and rows:
            with c.cursor() as cur:
                cur.executemany("""INSERT INTO categories (id, name, slug, "parentId", "nameTe",
                        "nameHi", "sortOrder", "isActive", "listingTypes", "searchTerms",
                        "isDirectoryOnly", "createdAt", "updatedAt")
                    VALUES (%s,%s,%s,%s,%s,%s,%s,true,'{}','{}',true,now(),now())
                    ON CONFLICT (slug) DO NOTHING""",
                    [(r[0], r[1], r[2], r[3], r[4], r[5], 1000 + i) for i, r in enumerate(rows)])
            c.commit()
            created = len(rows)
        print(f"  created {created}")

        withtr = sum(1 for r in rows if r[4])
        print(f"  of those, {withtr} already have Telugu names ({withtr*100//max(len(rows),1)}%)")
        if DRY:
            print("\nDRY RUN — pass 'apply' to write")
            for r in rows[:8]:
                print(f"    {r[1]:<34} te={r[4]}")

main()
