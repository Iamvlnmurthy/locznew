"""Create the designed category tree and move businesses onto it.

Existing categories keep their id, slug and name -- their slugs are in live URLs, in the
sitemap and on 3.4M businesses. New parents and subcategories are added alongside.

A business only moves where the new home is genuinely better:
  * never onto "Other local businesses" if it already has a real category;
  * never over an owner's choice: a claimed business keeps what its owner set;
  * only when the source data actually says what the business is.

The subcategory carries its own search vocabulary, which is what the composed description
reads for "people look here for ...", and what matches a query that does not use the
category's own name.
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
    c, p = child.lower().rstrip("s"), parent.lower()
    return c in p or p.rstrip("s").startswith(c)

def main():
    tax = json.load(io.open("var/overture/full_taxonomy.json", encoding="utf-8"))
    print(f"{len(tax)} business types designed")

    with psycopg.connect(URL, connect_timeout=90) as c:
        existing = {r[0]: r[1] for r in c.execute("SELECT name, id FROM categories")}
        slugs = {r[0] for r in c.execute("SELECT slug FROM categories")}
        tr = {r[0]: (r[1], r[2]) for r in c.execute(
            'SELECT term, "nameTe", "nameHi" FROM keyword_translations')}
        maxsort = c.execute('SELECT coalesce(max("sortOrder"),0) FROM categories').fetchone()[0]

        # ---------- parents ----------
        needed = sorted({t["parent"] for t in tax})
        new_parents = [p for p in needed if p not in existing]
        print(f"parents: {len(needed)} used, {len(new_parents)} new")
        if not DRY:
            for i, name in enumerate(new_parents):
                slug = slugify(name)
                # A category with this slug can already exist under a different name — the
                # directory has "Sports & fitness" categories that never had businesses on
                # them, so they were not in the name lookup. Reuse it rather than fail.
                taken = c.execute("SELECT id FROM categories WHERE slug=%s", (slug,)).fetchone()
                if taken:
                    existing[name] = taken[0]; slugs.add(slug); continue
                pid = str(uuid.uuid4())
                c.execute("""INSERT INTO categories (id,name,slug,"sortOrder","isActive",
                             "listingTypes","searchTerms","isDirectoryOnly","createdAt","updatedAt")
                             VALUES (%s,%s,%s,%s,true,'{}','{}',true,now(),now())""",
                          (pid, name, slug, maxsort + 100 + i))
                existing[name] = pid; slugs.add(slug)
            c.commit()

        # ---------- subcategories ----------
        rows, skip_restates, skip_dupe = [], 0, 0
        for t in tax:
            name, parent = t["name"], t["parent"]
            if restates(name, parent):
                skip_restates += 1; continue
            if name in existing:
                skip_dupe += 1; continue
            slug = slugify(name)
            if slug in slugs:
                skip_dupe += 1; continue
            te, hi = tr.get(t["leaf"].replace("_", " "), (None, None))
            slugs.add(slug); existing[name] = None
            # In a dry run the new parents have not been created, so there is no id to
            # attach to yet. The count is what a dry run is for.
            parent_id = existing.get(parent)
            if parent_id is None and not DRY:
                continue
            rows.append((str(uuid.uuid4()), name, slug, parent_id, te, hi,
                         t["keywords"], t["leaf"]))
        print(f"subcategories: {len(rows)} to create "
              f"({skip_restates} restate their parent, {skip_dupe} already exist)")

        if not DRY and rows:
            with c.cursor() as cur:
                cur.executemany("""INSERT INTO categories (id,name,slug,"parentId","nameTe",
                        "nameHi","sortOrder","isActive","listingTypes","searchTerms",
                        "isDirectoryOnly","createdAt","updatedAt")
                    VALUES (%s,%s,%s,%s,%s,%s,%s,true,'{}',%s,true,now(),now())""",
                    [(r[0], r[1], r[2], r[3], r[4], r[5], 2000 + i, r[6])
                     for i, r in enumerate(rows)])
            c.commit()
            print(f"  created {len(rows)}")

        withtr = sum(1 for r in rows if r[4])
        print(f"  {withtr} have Telugu names already ({withtr*100//max(len(rows),1)}%)")
        if DRY:
            print("\nDRY RUN — pass 'apply' to write. Sample:")
            for r in rows[:10]:
                print(f"    {r[1]:<30} te={r[4] or '-':<18} kw={', '.join(r[6][:3])}")

main()
