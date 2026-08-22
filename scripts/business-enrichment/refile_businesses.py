"""Move businesses onto the new, more specific categories.

The category is the most prominent line on a business page: the title, the h1, the
breadcrumb, the LocalBusiness type and the first sentence of the description. A computer
training institute filed under "Computer & laptop stores" is wrong in five places at once,
and invisible to anyone browsing coaching centres.

Guards, in order of importance:

  * A claimed business is never touched. Whatever its owner chose is what it keeps.
  * Nothing moves to "Other local businesses". A vague category is worse than an imperfect
    specific one, which is what made the first attempt at this a downgrade for 194,486
    businesses.
  * A business only moves onto a subcategory built for its own source type, so the move is
    reading the record more carefully, not reclassifying it from scratch.
"""
import io, json, os, sys, time, psycopg, duckdb

URL = io.open(
    r"C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER--gemini-antigravity-scratch-locz/3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
).read().strip()
DRY = "apply" not in sys.argv

def main():
    tax = {t["leaf"]: t for t in json.load(io.open("var/overture/full_taxonomy.json", encoding="utf-8"))}

    # leaf -> the category we want it in: the subcategory if one was created, else the parent
    with psycopg.connect(URL, connect_timeout=90) as c:
        by_name = {r[0]: r[1] for r in c.execute("SELECT name, id FROM categories")}
        target = {}
        for leaf, t in tax.items():
            cid = by_name.get(t["name"]) or by_name.get(t["parent"])
            if cid and t["parent"] != "Other local businesses":
                target[leaf] = cid
        print(f"{len(target)} business types have a category to move to")

        # which businesses those are, and what they are on now
        d = duckdb.connect(); d.execute("SET memory_limit='5GB'; SET threads=3;")
        R = lambda p: f"read_csv('{p}',header=true,AUTO_DETECT=true,ignore_errors=true)"
        d.execute(f"CREATE VIEW biz AS SELECT * FROM {R('var/overture/locz_businesses.csv.gz')}")
        d.execute("CREATE VIEW ovt AS SELECT * FROM 'var/overture/india_places.parquet'")
        d.execute("CREATE TABLE t(leaf VARCHAR, cid VARCHAR)")
        d.executemany("INSERT INTO t VALUES (?,?)", list(target.items()))
        rows = d.execute("""
            SELECT b.id, t.cid FROM biz b
            JOIN ovt o ON replace(b.sourceRecordId,'ovt:','') = o.id
            JOIN t ON t.leaf = o.taxonomy_hierarchy[-1]
            WHERE o.taxonomy_hierarchy IS NOT NULL""").fetchall()
        print(f"{len(rows):,} businesses have a proposed category")

        if DRY:
            print("\nDRY RUN — pass 'apply' to write"); return

        c.execute("""CREATE UNLOGGED TABLE IF NOT EXISTS ovt_recat(
            business_id uuid PRIMARY KEY, category_id uuid, done boolean NOT NULL DEFAULT false)""")
        c.commit()
        if c.execute("select count(*) from ovt_recat").fetchone()[0] == 0:
            t0 = time.time()
            with c.cursor().copy("COPY ovt_recat(business_id,category_id) FROM STDIN") as cp:
                for r in rows:
                    cp.write_row(r)
            c.commit()
            print(f"staged {len(rows):,} in {time.time()-t0:.0f}s")
        c.execute("CREATE INDEX IF NOT EXISTS ovt_recat_todo ON ovt_recat(business_id) WHERE NOT done")
        c.commit()
        print("staged. run the server-side procedure to apply.")

main()
