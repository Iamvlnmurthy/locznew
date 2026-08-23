# Picking this up on another machine

Everything in the repository is pushed. This covers what is **not** in it, and what
was left mid-flight.

## 1. What does not travel through git

`/var/` is gitignored (`.gitignore:64`) and holds 4.5 GB. Nothing there is precious —
it is all regenerable — but knowing what it was saves rediscovering it.

| path                | what it is                                      | need it again?                    |
| ------------------- | ----------------------------------------------- | --------------------------------- |
| `var/osm/` (4.5 GB) | Geofabrik India shapefiles: places, roads, POIs | re-download, see §4               |
| `var/*_audit.txt`   | quality, duplicate, name/category audit outputs | re-run the scripts                |
| `var/apk/`          | the signed release APK                          | rebuild, see §3                   |
| `var/shots/`        | screenshots and the CDP tools                   | tools are in `scripts/ui-verify/` |

**Secrets are deliberately absent and must be carried by hand:**

- **Android keystore** — `locz-upload-key.jks` + `key.properties`, ignored at
  `apps/mobile/android/.gitignore:12` and `:14`. A keystore committed once is
  compromised permanently and cannot be rotated for an app already on Play, so
  verify with `git check-ignore -v` before copying it anywhere.
- **`.env` on the VPS** at `/home/locz/app/.env` — includes `INTERNAL_API_KEY`,
  added tonight so server-side rendering skips the API's rate limiter.
- **Database URL** — the scripts read a file whose path is hard-coded in
  `scripts/business-enrichment/_db.py`. Point `DATABASE_URL` at your tunnel
  instead; `_db.url()` prefers the environment variable.

## 2. The database, and the one thing to know before touching it

```bash
ssh <host> -L 15433:127.0.0.1:5433     # note 5433
```

**`locz-postgres` publishes on 127.0.0.1:5433.** Port 5432 on that host belongs to a
different application entirely. A tunnel pointed at 5432 reaches the wrong database,
and the only thing that stopped one doing so was a password failure.

**Always connect through `scripts/business-enrichment/_db.py`.** It sets a statement
timeout, a `work_mem` ceiling and disables parallel workers, and `chunks()` walks
large tables by key rather than by OFFSET. That module exists because an ad-hoc
`ORDER BY random() LIMIT 5` — five rows — generated a random value for all 4.2
million, reached 3.5 GB, and took the host's OOM killer with it. The container now
has an 8 GiB ceiling; the discipline still matters.

Backups: `/usr/local/bin/locz-backup.sh` nightly at 02:30, seven days, each verified
with `pg_restore -l` before older ones are pruned. There were none before 23 August.

## 3. Rebuilding the APK

```bash
cp <keystore-dir>/{key.properties,locz-upload-key.jks} apps/mobile/android/
cd apps/mobile && flutter build apk --release
```

Verify with `apksigner verify --print-certs`, **not** `keytool -printcert -jarfile`:
the build is v2-signed with no v1 JAR signature, so keytool returns nothing and looks
like a failure. Expected certificate: `CN=LocZ, OU=Mobile, O=LocZ, L=Hyderabad,
ST=Telangana, C=IN`, SHA-256 beginning `991b07fc`.

The app is native Flutter and does **not** replicate the mobile web design. Bringing
it into line was deliberately deferred, to be done gradually rather than in one pass.

## 4. Left mid-flight

**Hindi transliteration — stopped, resumable.** Telugu reached 51,285 of 244,025
localities; Hindi is still at 14,467 because Sarvam began returning HTTPError on
every request, almost certainly a quota limit. Re-run when it resets:

```bash
SARVAM_KEY=... LOCALITY_LIMIT=40000 \
  python scripts/business-enrichment/translate_localities.py apply
```

Set `PYTHONIOENCODING=utf-8` or it dies printing Telugu to a Windows console — the
work succeeds and the progress line kills the run.

**IndexNow — ready, blocked.** Key file is live and verified at
`https://locz.in/3240382ae0194feb8c45b27cd749a069.txt`. Submission returns
`403 SiteVerificationNotCompleted`: Bing has not finished verifying the site. Retry
`python scripts/business-enrichment/indexnow_submit.py send` once it has. The Bing
Webmaster API is not an alternative — its quota is 100 URLs a day against 2.96
million pages.

**Locality landing pages — reverted, needs redesign.** `/in/[city]/[locality]/[category]`
was built and taken straight out again: Next forbids two different slug names at the
same path depth, so it collided with `/in/[city]/[category]` and returned 500 on all
70,400 existing hub pages. The API filter (`localitySlug`) and the locality lookup
endpoint survive and work — they are inert without a route. Either use a literal
segment (`/in/<city>/area/<locality>/...`) or rename the shared segment and resolve
category-then-locality. The second gives the better URL and rewrites a route that is
currently indexed, so reproduce it locally first.

**OSM POI matching — widen it.** `osm_category_match.py` used only
`gis_osm_pois_free_1` (points) and about fifty unambiguous `fclass` values, reaching
3.6% of the directory. The archive also contains `gis_osm_pois_a_free_1` — building
polygons, never opened. Both together might reach 8–12%.

```bash
curl -L -O https://download.geofabrik.de/asia/india-latest-free.shp.zip   # 1.8 GB
```

## 5. Two mistakes worth not repeating

**Proximity does not identify a business.** Matching the nearest OSM POI within 60m
disagreed with our categories 82% of the time — and reading the disagreements showed
OSM was describing _a different shop_: a jeweller correctly filed, with a bank
recorded 11m away. Requiring the two _names_ to agree took agreement to 76%. The
first result looked like a finding and was an artefact.

**A green build sees nothing.** Three faults shipped that typechecked cleanly: a
banner behind a scrim, a business name clipped off the top of a phone, and an AdSense
tag that never reached the HTML because `next/script` with `afterInteractive` emits a
preload and injects the real tag from JavaScript. Verify the thing the consumer
actually consumes — `scripts/ui-verify/` has the tools: `seo-check.mjs` for crawler
output, `shot-theme.mjs` for a forced colour scheme, `measure.mjs` for layout
geometry.

## 6. What to read first

`docs/WORKLOG_2026-08-23.md` — the full account of 23 August, including the
corrections. `docs/NOMINATIM_SETUP.md` for the mandal work. `docs/BANNER_ROUND2_BRIEF.md`
if more category artwork is wanted.

And when there is a fresh Search Console export: the number that matters is
**Discovered – currently not indexed**, which stood at 1,768,869 against 19,200
indexed. Everything done on 23 August aimed at that ratio, and nothing before roughly
26 August can show it.
