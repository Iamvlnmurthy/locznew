"""Create prod city rows for the tier-1/2 cities that have Wikipedia content but no prod row.

Idempotent: ON CONFLICT (slug) DO NOTHING. geo populated for radius queries. isLaunched stays
false so serviceability is unchanged. bilaspur is skipped (aliases to existing bilaspur-cgh).
Run with 'apply' to write; otherwise dry-run.
"""
import sqlite3, sys, psycopg

APPLY = "apply" in sys.argv
CREATE = ["asansol", "bhubaneswar", "bhilai", "durgapur", "guwahati", "jamshedpur",
          "kakinada", "kochi", "mangaluru", "noida", "rajamahendravaram", "rourkela",
          "siliguri", "tiruppur"]

src = sqlite3.connect("/home/locz/locz_cities.db"); src.row_factory = sqlite3.Row
prod = psycopg.connect(open("/tmp/locz_dburl").read().strip(), connect_timeout=60, autocommit=False)

# what columns does the source have?
scols = [r[1] for r in src.execute("PRAGMA table_info(cities)").fetchall()]
print("source cols:", scols)

existing = {r[0] for r in prod.execute("SELECT slug FROM cities").fetchall()}
made = skipped = 0
for slug in CREATE:
    c = src.execute("SELECT * FROM cities WHERE city_slug=?", (slug,)).fetchone()
    if not c:
        print(f"  {slug}: NOT in locz_cities.db — skip"); continue
    if slug in existing:
        print(f"  {slug}: already in prod — skip"); continue
    state = c["state_ut"]
    st = prod.execute("SELECT id FROM states WHERE lower(name)=lower(%s)", (state,)).fetchone()
    if not st:
        print(f"  {slug}: state '{state}' missing — skip"); continue
    lat = c["latitude"] if "latitude" in scols else c["lat"]
    lng = c["longitude"] if "longitude" in scols else c["lng"]
    tier = c["tier"] if "tier" in scols else None
    pop = c["population_city_proper"] if "population_city_proper" in scols else None
    try:
        pop = int(pop) if pop not in (None, "") else None
    except (ValueError, TypeError):
        pop = None
    print(f"  {slug:18} state={state:15} lat={lat} lng={lng} tier={tier} pop={pop}")
    if APPLY:
        prod.execute(
            'INSERT INTO cities (id,"stateId",name,slug,latitude,longitude,geo,'
            '"isActive","isLaunched",population,tier,"createdAt","updatedAt") '
            "VALUES (gen_random_uuid(),%s,%s,%s,%s,%s,"
            "ST_SetSRID(ST_MakePoint(%s,%s),4326),true,false,%s,%s,now(),now()) "
            "ON CONFLICT (slug) DO NOTHING",
            (st[0], c["city_name"], slug, lat, lng, lng, lat, pop, tier))
        made += 1
if APPLY:
    prod.commit()
    print(f"\nInserted {made} cities (dry={not APPLY}).")
else:
    print("\nDRY RUN — pass 'apply' to write.")
