# Business Enrichment — run from any machine

Adds, to **existing** LocZ businesses only (never inserts new ones):

- a 2-sentence **description** + **SEO keywords** (Sarvam, India-tuned — uses only real facts)
- **phone / website / address** from **Overture Maps** (storage-safe, permissive license)

It writes straight to the prod DB, **batch-committed and resumable** — filters on
`description IS NULL`, so re-running (or running from a second machine) just continues.
Safe to Ctrl-C anytime.

> **Claude: when the user points you at this file, execute the steps below in order.**
> Stop and report if a prerequisite is missing; do not invent data or relax the safety rules
> in [enrich.py](enrich.py) (facts-only generation, `IS NULL` guard, `COALESCE` on phone/website).

---

## 0. Prerequisites (once per machine)

```bash
pip install duckdb "psycopg[binary]"
```

Two env vars (never commit them):

```bash
export DATABASE_URL="postgresql://USER:PASS@HOST:5433/locz"   # prod Postgres — note port 5433
export SARVAM_KEY="sk_..."                                    # Sarvam API key
```

- `DATABASE_URL` = the same prod DB the API uses. Copy it verbatim from the VPS (`ssh onrol`,
  read `/home/locz/app/.env`) rather than composing it by hand.
- **`locz-postgres` publishes on `127.0.0.1:5433`, not 5432** — port 5432 on that host belongs
  to a different application. A tunnel or URL pointing at 5432 reaches the wrong database. See
  `docs/HANDOFF.md` §2, and prefer `scripts/business-enrichment/_db.py` (statement timeout +
  memory ceiling + keyset paging) for any bulk work.
- Cost is ~₹0.0025 / business (~250 tokens). Full 3.4M ≈ ₹9,000. A batch of a few thousand is paise.

## 1. Column check (10 seconds)

The script expects `businesses` to have: `id, name, category, city, latitude,
longitude, description, keywords (text[]), "primaryPhone", website, "attributionText"`.
If any differ, adjust the `SELECT`/`UPDATE` in [enrich.py](enrich.py). Verify:

```bash
psql "$DATABASE_URL" -c '\d businesses' | grep -E 'description|keywords|latitude|primaryPhone|website|attributionText'
```

## 2. Overture places file (once — the one heavy prerequisite, ~450 MB)

If `var/overture/india_places.parquet` is **not** present on this machine, build it once
from Overture's public release (India bbox only):

```bash
mkdir -p var/overture
duckdb -c "
INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;
SET s3_region='us-west-2';
COPY (
  SELECT id, names.primary AS name,
         categories.primary AS category, categories.alternate AS category_alt,
         confidence, bbox.xmin AS lon, bbox.ymin AS lat,
         phones, websites, emails, socials, brand.names.primary AS brand,
         addresses[1].freeform AS addr_freeform, addresses[1].locality AS addr_locality,
         addresses[1].postcode AS addr_postcode, addresses[1].region AS addr_region
  FROM read_parquet('s3://overturemaps-us-west-2/release/2025-01-22.0/theme=places/type=place/*', hive_partitioning=1)
  WHERE bbox.xmin BETWEEN 68 AND 97 AND bbox.ymin BETWEEN 6 AND 37
) TO 'var/overture/india_places.parquet' (FORMAT parquet);
"
```

> Bump `release/2025-01-22.0` to the latest tag from https://docs.overturemaps.org/release/latest/ if that path 404s.
> ~4.5M India POIs, ~3.3M with phone. This file is **not** in git (too big) — it lives only under `var/`.

## 3. Run

```bash
# a small test slice first
ENRICH_LIMIT=20 python scripts/business-enrichment/enrich.py

# then the real run (all remaining; Ctrl-C-safe, resumable)
python scripts/business-enrichment/enrich.py
```

Tunables (env): `ENRICH_LIMIT` (0 = all), `ENRICH_BATCH` (default 50, commit size),
`ENRICH_SIM_MIN` (default 0.55, Overture name-match threshold), `OVERTURE_PARQUET` (path override).

## 4. Verify

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FILTER (WHERE description IS NOT NULL) AS enriched, count(*) AS total FROM businesses;"
psql "$DATABASE_URL" -c "SELECT name, description, keywords FROM businesses WHERE description IS NOT NULL ORDER BY id DESC LIMIT 5;"
```

Because it commits per batch and writes to prod directly, enriched data is immediately
live on the site and visible from any machine — nothing is stranded locally.
