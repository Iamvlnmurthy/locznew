"""Create the neighbourhoods Overture knows about, and point businesses at them.

`addresses.localityId` is a foreign key, so a locality name is not enough — the row has to
exist. Most of these 107,570 city+neighbourhood pairs are not in the localities table, which
was built from India Post data and holds post office names rather than the places people say.

New rows carry real coordinates, which matters: the existing 155,543 localities share junk
centroids (three different Bangalore localities sit on one point, 34km from where they
belong), which is why proximity against them never worked.
"""
import io, re, time, unicodedata, uuid, duckdb, psycopg

URL = io.open(
    r"C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER--gemini-antigravity-scratch-locz/3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
).read().strip()

def slugify(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s))[:150]

def main():
    d = duckdb.connect(); d.execute("SET memory_limit='4GB'; SET threads=3;")
    d.execute("CREATE VIEW l AS SELECT * FROM 'var/overture/locality_links.parquet'")

    with psycopg.connect(URL, connect_timeout=90) as c:
        cities = {r[0]: r[1] for r in c.execute("SELECT name, id FROM cities")}

        # --- the localities themselves ---
        pairs = d.execute("SELECT DISTINCT city, locality, lat, lon FROM l").fetchall()
        rows = []
        for city, loc, lat, lon in pairs:
            cid = cities.get(city)
            if cid and loc:
                rows.append((str(uuid.uuid4()), cid, loc[:140], slugify(loc)[:160], lat, lon))
        print(f"{len(rows):,} city+locality pairs to ensure")
        t0 = time.time()
        for i in range(0, len(rows), 5000):
            with c.cursor() as cur:
                cur.executemany("""
                  INSERT INTO localities (id,"cityId",name,slug,latitude,longitude,"isActive","createdAt","updatedAt")
                  VALUES (%s,%s,%s,%s,%s,%s,true,now(),now())
                  ON CONFLICT ("cityId", slug) DO NOTHING""", rows[i:i+5000])
            c.commit()
        print(f"  ensured in {time.time()-t0:.0f}s")

        # --- the links ---
        c.execute("""CREATE UNLOGGED TABLE IF NOT EXISTS ovt_loclink(
            business_id uuid PRIMARY KEY, city text, slug text, done boolean NOT NULL DEFAULT false)""")
        c.commit()
        if c.execute("select count(*) from ovt_loclink").fetchone()[0] == 0:
            t0 = time.time(); n = 0
            cur_d = d.execute("SELECT business_id, city, locality FROM l")
            with c.cursor().copy("COPY ovt_loclink(business_id,city,slug) FROM STDIN") as cp:
                while True:
                    chunk = cur_d.fetchmany(50_000)
                    if not chunk: break
                    for bid, city, loc in chunk:
                        cp.write_row((bid, city, slugify(loc)[:160])); n += 1
            c.commit(); print(f"staged {n:,} links in {time.time()-t0:.0f}s")
        c.execute("CREATE INDEX IF NOT EXISTS ovt_loclink_todo ON ovt_loclink(business_id) WHERE NOT done")
        c.commit()
        print("staged. run apply_locality_links() to apply.")

main()
