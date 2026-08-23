# Self-hosted Nominatim for LocZ — when it is worth it, and how

Written for a machine with disk to spare. **Read section 1 first: you may not need this.**

## 1. Do you actually need it?

Most of what Nominatim would give has already been extracted from the same OpenStreetMap
data, without installing anything, by matching against Geofabrik's published layers. See
`docs/ENRICHMENT_LOG.md` and `var/osm/`.

Coverage after that work:

| field    | coverage | source                                           |
| -------- | -------- | ------------------------------------------------ |
| city     | 100%     | nearest city centroid — reliable                 |
| locality | ~75%     | Overture division points + OSM place nodes       |
| street   | ~80%     | OSM `gis_osm_roads_free_1` — matched within 300m |
| pincode  | 100%     | already on the record                            |
| mandal   | 0%       | **only Nominatim gives this**                    |

**Nominatim is worth installing if you want:**

- **mandal / taluk / tehsil** — nothing else we have provides it. Nominatim returns
  "Gandipet mandal", "Upleta Taluka", "Ludhiana (West) Tahsil" reliably.
- **better locality precision.** On a ten-point sample Nominatim was correct 10/10 where
  Overture's division points were about 6/10. Its failure mode differs: where Overture
  returns the town ("Ernakulam" for a shop in Ernakulam), Nominatim returns the
  neighbourhood ("Shenoys").
- **house numbers**, where OSM has them.

**It is not worth installing** just for street names or city — those are already done.

## 2. What it costs

|             |                                                               |
| ----------- | ------------------------------------------------------------- |
| disk        | **~100 GB** for India. This is the binding constraint.        |
| RAM         | 8 GB minimum, 16–32 GB makes the import far faster            |
| import time | 4–12 hours for the India extract, depending on disk speed     |
| software    | PostgreSQL 14+, PostGIS, osm2pgsql, PHP — or the Docker image |

The LocZ VPS has ~80 GB free and runs a dozen other applications; do not install it there.
Use a machine with 150 GB free to be safe.

## 3. Install (Docker — the least painful route)

```bash
mkdir -p /data/nominatim && cd /data/nominatim
curl -L -o india-latest.osm.pbf https://download.geofabrik.de/asia/india-latest.osm.pbf   # ~1.6 GB

docker run -it --shm-size=1g \
  -e PBF_PATH=/nominatim/data/india-latest.osm.pbf \
  -e IMPORT_WIKIPEDIA=false \
  -e THREADS=4 \
  -v /data/nominatim:/nominatim/data \
  -p 8080:8080 \
  --name nominatim \
  mediagis/nominatim:4.4
```

Notes that matter:

- **`--shm-size=1g` is not optional.** The default 64 MB is exactly the fault that caused
  intermittent 500s on LocZ's own Postgres (`ERROR 53100: could not resize shared memory
segment`). osm2pgsql will hit it harder than the application ever did.
- `IMPORT_WIKIPEDIA=false` saves several GB and a long download. Wikipedia data only affects
  result _ranking_, which does not matter for reverse geocoding.
- `THREADS` should be about the core count. More threads on a slow disk will not help.

The container serves on `http://localhost:8080` when the import finishes.

## 4. Check it before running 3.4 million queries

```bash
curl "http://localhost:8080/reverse?format=jsonv2&lat=17.4065&lon=78.3372&zoom=18&addressdetails=1"
```

A good answer for that point (Gachibowli, Hyderabad) contains:

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

If `suburb`/`village` and `county` are present, it is working. If you only get `state` and
`country`, the import did not finish — check the container log rather than proceeding.

## 5. Running the directory through it

Export the businesses that still need something:

```sql
COPY (
  SELECT b.id, b.latitude, b.longitude
  FROM businesses b LEFT JOIN addresses a ON a.id = b."addressId"
  WHERE b.latitude IS NOT NULL
    AND (a."localityId" IS NULL OR a.id IS NULL OR a.line1 IS NULL)
) TO STDOUT WITH (FORMAT csv, HEADER true);
```

Then query the local instance. It has no rate limit — that restriction applies to the public
service, not your own — so the only limit is CPU.

```python
import csv, json, urllib.request, io

BASE = "http://localhost:8080/reverse"
out = csv.writer(io.open("osm_reverse.csv", "w", newline="", encoding="utf-8"))
out.writerow(["id", "locality", "mandal", "road", "postcode", "house_number"])

for row in csv.DictReader(io.open("needs.csv", encoding="utf-8")):
    url = f"{BASE}?format=jsonv2&lat={row['latitude']}&lon={row['longitude']}&zoom=18&addressdetails=1"
    try:
        a = json.load(urllib.request.urlopen(url, timeout=30)).get("address", {})
    except Exception:
        continue
    out.writerow([
        row["id"],
        a.get("suburb") or a.get("village") or a.get("neighbourhood") or a.get("hamlet") or "",
        a.get("county") or a.get("state_district") or "",
        a.get("road") or "",
        a.get("postcode") or "",
        a.get("house_number") or "",
    ])
```

Expect roughly 100–500 lookups/second locally. 3.4M takes a few hours; run it in batches so a
crash costs one batch, not the run.

## 6. Loading the results back

Follow what `scripts/business-enrichment/link_localities.py` already does — do not invent a
new path:

1. **Localities are a foreign key**, not a string. Create the missing rows first, keyed by
   `(cityId, slug)`, which is the unique constraint.
2. **Never overwrite.** A locality matched from the written address, or a street transcribed
   from the source, beats anything inferred. Fill only where the column is empty.
3. **Apply in batches from inside the database.** The procedures in
   `var/overture/*_proc.sql` show the shape: commit per batch, `pg_sleep(0.2)` between, one
   writer at a time. Two concurrent writers on `businesses` deadlocked each other, and with
   `SKIP LOCKED` a second session can make the first exit early believing it has finished.
4. **Guard the column widths.** `pincodeCode` is `varchar(6)`, `primaryPhone` `varchar(20)`,
   `line1` `varchar(200)`. Drop a value that will not fit rather than truncating it: half a
   URL is a broken link and half a phone number is a wrong number.

`mandal` is a plain column on `localities`, so it can be set directly — no new table needed.

## 7. What to watch for

- **Do not trust the postcode Nominatim returns over the coordinates.** Overture had
  Karimnagar businesses carrying Hyderabad postcodes; the coordinates were right and the
  postcode was wrong. The same will happen here.
- **Check the script, not just the value.** A validator downstream of a hallucination is the
  wrong place to stand — that lesson came from a translation job, and it applies to any
  derived field.
- **Sample before committing.** Every dataset tried here looked plausible in the abstract and
  had to be judged on real output. Overture's division _polygons_ returned "CMWSSB Division
  63" and mapped East Delhi to Rohini; its division _points_ were fine. The difference was
  only visible by looking.
