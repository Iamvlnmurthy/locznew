# Self-hosted Nominatim for LocZ — full runbook

For a machine with disk to spare (4 TB is far more than enough; the import needs about
250 GB with room to work). This replaces the earlier `NOMINATIM_PLAN.md`, which was written
to argue you probably should not bother. With a large machine available, you should.

**What this buys you, concretely:** the mandal/taluk/tehsil, plus a better neighbourhood for
roughly the 40% of localities where the coarser sources returned a town name instead.

An earlier draft of this document said mandal was 0% populated. That was wrong, and the
correction changes the case for doing this rather than removing it. 116,899 localities carry
a mandal, reaching about 870,000 businesses — but the quality is mixed. A random sample
returns real mandals (Surgana, Chikhli, Narsipatnam) alongside plain district names
(Varanasi, Katihar, Karimnagar). Two provably useless classes have since been cleared: 578
localities held the literal string "Nil", and 30,023 held a "mandal" identical to their own
city, which tells a reader nothing the address had not already said.

So the real position is: about a quarter of businesses have a mandal of uncertain quality,
and three quarters have none. Nominatim is still worth running — it is the only source that
distinguishes a mandal from the district containing it — but go in expecting to _correct_
existing values as much as to fill gaps, and prefer Nominatim's answer where the two
disagree.

---

## 1. What you get, and what you already have

| field        | now                 | after Nominatim                                |
| ------------ | ------------------- | ---------------------------------------------- |
| city         | 100%                | unchanged — do not overwrite                   |
| pincode      | 100%                | unchanged — **do not trust Nominatim's**       |
| street       | 80%                 | ~85%, marginal                                 |
| locality     | 67%                 | ~90%, and more precise                         |
| **mandal**   | ~21%, mixed quality | **~85%, and consistent — the reason to do it** |
| house number | ~0%                 | ~15%, where OSM has it                         |

On a ten-point sample Nominatim was right 10/10 where Overture's division points were about
6/10. The failure modes differ usefully: where Overture returns the town ("Ernakulam" for a
shop in Ernakulam), Nominatim returns the neighbourhood ("Shenoys").

**Do not use it for the postcode.** Overture already gave Karimnagar businesses Hyderabad
postcodes; the coordinates were right and the postcode was wrong. Nominatim will make the same
class of error, and our pincode column is already 100% populated from the source record.

---

## 2. Machine requirements

|             | minimum | comfortable                    |
| ----------- | ------- | ------------------------------ |
| disk        | 150 GB  | 250 GB+ (you have 4 TB)        |
| RAM         | 8 GB    | 32 GB — this is the real lever |
| CPU         | 4 cores | 8+                             |
| import time | 12 h    | 4–6 h                          |

RAM matters far more than disk here. osm2pgsql keeps node caches in memory; with 8 GB it
spills to disk constantly and the import can take three times as long.

**Use SSD/NVMe.** On spinning disk the import can run for days.

---

## 3. Install (Docker — the least painful route)

```bash
mkdir -p /data/nominatim && cd /data/nominatim

# India extract, ~1.6 GB
curl -L -O https://download.geofabrik.de/asia/india-latest.osm.pbf

docker run -d \
  --name nominatim \
  --shm-size=2g \
  -e PBF_PATH=/nominatim/data/india-latest.osm.pbf \
  -e IMPORT_WIKIPEDIA=false \
  -e IMPORT_US_POSTCODES=false \
  -e THREADS=8 \
  -e NOMINATIM_DATABASE_WEBUSER=www-data \
  -v /data/nominatim:/nominatim/data \
  -p 8080:8080 \
  mediagis/nominatim:4.4
```

Notes that matter, each learned the hard way:

- **`--shm-size=2g` is not optional.** Docker's default is 64 MB. That exact fault caused
  intermittent 500s on LocZ's own Postgres (`ERROR 53100: could not resize shared memory
segment`), and osm2pgsql hits shared memory far harder than the application ever did.
- **`IMPORT_WIKIPEDIA=false`** saves several GB and a long download. Wikipedia data only
  affects result _ranking_, which is irrelevant for reverse geocoding.
- **`THREADS`** ≈ core count. More threads on a slow disk will not help.
- Watch it with `docker logs -f nominatim`. The import is silent for long stretches; that is
  normal, not a hang.

---

## 4. Verify before running four million queries

```bash
curl "http://localhost:8080/reverse?format=jsonv2&lat=17.4065&lon=78.3372&zoom=18&addressdetails=1"
```

A good answer for that point (Gachibowli, Hyderabad):

```json
{
  "address": {
    "suburb": "Gachibowli",
    "county": "Serilingampally mandal",
    "state_district": "Ranga Reddy",
    "state": "Telangana",
    "postcode": "500032"
  }
}
```

**If `suburb`/`village` and `county` are present, it works.** If you only get `state` and
`country`, the import did not finish — read the container log rather than proceeding.

Test three more points in different states before committing to a full run. Kerala, Assam and
Rajasthan will exercise different parts of the data than Telangana.

---

## 5. Export the businesses that need something

Run on the LocZ VPS. **Note the port: `locz-postgres` is published on `127.0.0.1:5433`.**
Port 5432 on that host belongs to a different application entirely, and a tunnel pointed at
it reaches the wrong database.

```bash
docker exec locz-postgres psql -U locz -d locz -c "\copy (
  SELECT b.id, b.latitude, b.longitude
  FROM businesses b
  LEFT JOIN addresses a ON a.id = b.\"addressId\"
  LEFT JOIN localities l ON l.id = a.\"localityId\"
  WHERE b.\"deletedAt\" IS NULL
    AND b.latitude IS NOT NULL
    AND (l.id IS NULL OR l.mandal IS NULL OR a.line1 IS NULL)
) TO STDOUT WITH (FORMAT csv, HEADER true)" > needs.csv

wc -l needs.csv   # expect roughly 4 million
```

Copy `needs.csv` to the Nominatim machine.

---

## 6. Run the lookups

A local instance has **no rate limit** — that restriction applies to the public service, not
your own. The only limit is CPU. Expect 100–500 lookups/second.

```python
# reverse.py — resumable, batched, and safe to kill at any point.
import csv, io, json, os, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "http://localhost:8080/reverse"
OUT = "osm_reverse.csv"
WORKERS = 8          # roughly the core count; more just queues inside Nominatim

done = set()
if os.path.exists(OUT):
    with io.open(OUT, encoding="utf-8") as f:
        done = {r["id"] for r in csv.DictReader(f)}
    print(f"resuming, {len(done):,} already done")

rows = [r for r in csv.DictReader(io.open("needs.csv", encoding="utf-8"))
        if r["id"] not in done]
print(f"{len(rows):,} to do")

def lookup(row):
    url = (f"{BASE}?format=jsonv2&lat={row['latitude']}&lon={row['longitude']}"
           f"&zoom=18&addressdetails=1")
    try:
        a = json.load(urllib.request.urlopen(url, timeout=30)).get("address", {})
    except Exception:
        return None
    return [
        row["id"],
        a.get("suburb") or a.get("village") or a.get("neighbourhood")
            or a.get("hamlet") or a.get("town") or "",
        a.get("county") or a.get("state_district") or "",
        a.get("road") or "",
        a.get("house_number") or "",
    ]

f = io.open(OUT, "a", newline="", encoding="utf-8")
w = csv.writer(f)
if not done:
    w.writerow(["id", "locality", "mandal", "road", "house_number"])

with ThreadPoolExecutor(max_workers=WORKERS) as pool:
    for i, res in enumerate(pool.map(lookup, rows), 1):
        if res:
            w.writerow(res)
        if i % 20000 == 0:
            f.flush()
            print(f"  {i:,}/{len(rows):,}", flush=True)
f.close()
```

Run it under `nohup`/`screen`. Four million at ~300/s is around four hours.

**Write the file as you go, not at the end.** An earlier enrichment run held everything in
memory and lost the lot when the process died.

---

## 7. Clean the mandal values before loading

Nominatim returns the label as OSM has it, which is inconsistent across states: `"Gandipet
mandal"`, `"Upleta Taluka"`, `"Ludhiana (West) Tahsil"`, sometimes just `"Ranga Reddy"`. Strip
the noun and keep the name.

```python
import re
SUFFIX = re.compile(r"\s+(mandal|manḍal|taluka|taluk|tahsil|tehsil|block|circle)\s*$", re.I)

def clean_mandal(value):
    v = SUFFIX.sub("", (value or "").strip())
    # A district name is not a mandal. If it equals the district we already hold,
    # it carries no information and should be dropped rather than stored.
    return v if 2 < len(v) <= 120 else None
```

**Sample a hundred before loading four million.** Every dataset tried on this project looked
plausible in the abstract and had to be judged on real output — Overture's division _polygons_
returned "CMWSSB Division 63" and mapped East Delhi to Rohini, while its division _points_
were fine. The difference was only visible by looking.

---

## 8. Load the results back

Copy `osm_reverse.csv` to the VPS and follow what
`scripts/business-enrichment/link_localities.py` already does. Do not invent a new path.

Five rules, each of which cost a day when it was learned:

1. **Localities are a foreign key, not a string.** Create missing rows first, keyed by
   `(cityId, slug)` — that is the unique constraint. `mandal` is a plain column on
   `localities`, so it can be set directly.
2. **Never overwrite.** A locality matched from the written address, or a street transcribed
   from the source, beats anything inferred. Fill only where the column is empty
   (`COALESCE(existing, new)` or a `WHERE col IS NULL` guard).
3. **Apply in batches from inside the database.** See `var/overture/*_proc.sql`: commit per
   batch, `pg_sleep(0.2)` between, **one writer at a time**. Two concurrent writers on
   `businesses` deadlocked each other, and with `SKIP LOCKED` a second session can make the
   first exit early believing it has finished — that silently left 707,841 addresses
   unapplied and looking complete.
4. **Guard the column widths.** `pincodeCode` is `varchar(6)`, `primaryPhone` `varchar(20)`,
   `line1` `varchar(200)`. Drop a value that will not fit rather than truncating it: half a
   URL is a broken link and half a phone number is a wrong number.
5. **Scrub control characters.** The last import died at 628,000 of 793,045 rows on
   `PostgreSQL text fields cannot contain NUL (0x00) bytes`. One bad byte rejects the whole
   batch. `scripts/business-enrichment/import_businesses.py` has a `scrub()` helper — reuse it.

Use `scripts/business-enrichment/_db.py` for the connection: it sets a statement timeout, a
`work_mem` ceiling and disables parallel workers. That module exists because an unbounded
ad-hoc query took the production database into crash recovery.

---

## 9. Verify, then move on

```sql
SELECT count(*) FILTER (WHERE mandal IS NOT NULL) AS with_mandal,
       count(*) AS total
FROM localities;
```

Then read twenty business pages across different states and check the mandal against what you
know. A validator downstream of a bad value is the wrong place to stand — that lesson came
from a translation job where the model returned perfect Telugu naming a place that does not
exist, and the script check accepted it.

## 10. Keeping it

The container can be stopped once the run is complete; the data does not change fast enough to
justify keeping 250 GB hot. Re-import from a fresh Geofabrik extract when you next need it —
that is simpler than maintaining replication, and India's OSM coverage changes slowly enough
that quarterly is generous.
