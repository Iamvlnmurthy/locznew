# LocZ Hyperlocal Data Engine — Implementation Plan

> Purpose: solve the cold-start problem — LocZ must be useful in a locality **before** it has
> users or business-generated listings — by continuously building a geo-indexed local-data
> graph from _permitted_ external sources, businesses, and users. This is a **plan**, not a
> build. It maps the strategy prompt (Parts 1–65) onto what LocZ already has and sequences the
> work to minimise regressions.

## 0. The single most important finding

**LocZ already imported a ~4M-record business directory.** The `Business` model has PostGIS
`geo`, `latitude/longitude`, `claimStatus` (`OWNER_CREATED` default; imported records use a
placeholder owner), a licence/source-provenance field, and working **business claiming**
(`claim-signals.ts`, `business-claims.spec`). So Layer A/C (external POIs + business claiming)
and the flywheel's first two turns already exist in raw form. The Data Engine is mostly a
**framework around assets we already have**, not a green-field build.

## 1. Existing architecture → prompt requirements

| Prompt need                                          | Status in LocZ                                                  | Action                                        |
| ---------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Geospatial DB (Part 10) — PostGIS, lat/lon, distance | ✅ `GeoRepository`, `geo geography(Point,4326)`, GiST indexes   | **Reuse**                                     |
| Background jobs / scheduler (Part 42)                | ✅ BullMQ (3 queues), `LifecycleScheduler`, worker process      | **Reuse / extend**                            |
| Object storage + signed uploads (Parts 25–27)        | ✅ MinIO (S3-compatible), EXIF strip, WebP renditions           | **Reuse**; add `media_origin`                 |
| Business directory seed (Parts 7, 21-Businesses)     | ✅ ~4M imported `Business` rows w/ placeholder owners           | **Reuse** as first canonical layer            |
| Business claiming (Parts 9, 56)                      | ✅ `claim-signals.ts`, verification, `BusinessClaimStatus`      | **Reuse / expand**                            |
| Category taxonomy (Parts 4, 22)                      | ✅ 30 categories + `taxonomy.json`, `directory-categories.json` | **Reuse**; add source-tag → canonical mapping |
| Radius / distance discovery (Parts 12–19)            | 🟡 radius filter + auto-widen (just shipped)                    | **Extend** to distance bands + sufficiency    |
| Expiry / freshness (Parts 32–33)                     | 🟡 `expire-listings`, `ListingStatus` lifecycle                 | **Generalise** to per-source refresh policies |
| Moderation / trust (Parts 34, 42)                    | 🟡 moderation + reports modules                                 | **Extend** with source trust levels           |
| Source registry (Part 3)                             | ⬜ none                                                         | **Build**                                     |
| Raw ingestion layer (Part 6)                         | ⬜ none                                                         | **Build**                                     |
| Canonical entity + dedup engine (Parts 7–8)          | ⬜ (implicit in directory)                                      | **Build** the framework                       |
| Connector interface (Part 41)                        | ⬜ none                                                         | **Build**                                     |
| Provenance / licensing admin (Parts 31, 51)          | 🟡 one licence field on Business                                | **Build** proper model                        |
| Coverage / cold-start dashboard (Parts 36–37)        | ⬜ none                                                         | **Build**                                     |
| City launch states (Part 38)                         | 🟡 `City.isLaunched` boolean                                    | **Extend** to a lifecycle enum                |

**Net-new is a framework, not a rewrite.** Nothing here requires a new DB, language, or
framework (Part: "do not introduce a new database/framework without a genuine requirement").

## 2. Data model additions (Prisma)

New models (names indicative), all in the existing Postgres via Prisma migrations:

- **`DataSource`** (Part 3) — id, name, type, category, docsUrl, baseUrl, authMethod, enabled,
  refreshStrategy, rateLimit, trustLevel, priority, attributionText, **licensing gate**
  (`termsReviewed`, `commercialUse`, `storagePermitted`, `cachingPermitted`, `mediaDisplay`,
  `attributionRequired`, `reviewedAt`, `reviewNotes`), health (`lastSuccessAt`, `lastFailAt`,
  `errorCount`, `health`). **No API keys here** — keys stay in env/secrets (Part 3).
- **`SourceRawRecord`** (Part 6) — sourceId, externalId, rawPayload(jsonb), retrievedAt,
  sourceUpdatedAt, hash, processingStatus, processingError. Never user-facing.
- **`CanonicalEntity` links** (Part 7) — add an `ExternalIdentity` join (canonicalId, sourceId,
  externalId, originalUrl, confidence) so one real place ↔ many source rows. The existing
  `Business` row **is** the canonical entity for POIs; other domains (events, jobs) get their
  own canonical tables or reuse `Listing` with a `source`/provenance block.
- **Provenance block** (Part 31) — reusable embedded fields (sourceId, externalId, originalUrl,
  retrievedAt, sourcePublishedAt, licenseMeta, attributionText, mediaRightsState, lastVerifiedAt,
  expiresAt, confidence, trustLevel) added to POI/event/job/news records.
- **`media_origin`** enum (Part 24) — `EXTERNAL | LOCZ_UPLOAD | LOCZ_GENERATED | PERMITTED_CACHE`
  on media rows; only `LOCZ_UPLOAD`/`PERMITTED_CACHE` ever live in MinIO.
- **`DistanceBandConfig`** (Parts 13, 16) — centralised, tunable by city/category/contentType
  (default bands 0–3 / 3–5 / 5–10 / 10–25 km). Not hard-coded in components.
- **`City.launchState`** (Part 38) — enum `PLANNED | SEEDING | REVIEW | ACTIVE | LIMITED`
  (replaces the bare `isLaunched` boolean, kept for back-compat during migration).
- **`AreaCoverage`** (Parts 36–37) — per geo-cell counts (businesses/food/health/jobs/events/…),
  lastRefresh, stalePct, coverageScore, for the data-health dashboard and cold-start detection.
- **Geo cells** (Part 11) — add an `h3`/geohash column to geo-bearing rows for ingestion
  scheduling, density, and cache keys. **Ranking still uses true distance** (Part 11 caveat).

## 3. Connector framework (Parts 41, 44, 45)

A single `SourceConnector` interface in the API (server-side only — Part 45), each connector
implementing: `fetch() → normalize() → validate() → mapCategory() → mapLocation() →
extractMedia() → calculateExpiry() → provenance() → handleRateLimit() → healthCheck()`.
Connectors run as **BullMQ jobs** (Part 42) on per-source schedules, write to `SourceRawRecord`,
then a shared pipeline runs **normalise → geo-enrich → dedupe (confidence-scored, Part 8) →
upsert canonical → freshness/expiry**. Source fallback chains (Part 44): primary → secondary →
LocZ first-party → permitted stale cache — never blind-merged.

## 4. Progressive distance discovery (Parts 12–19) — extends work already shipped

We already have a radius filter + auto-widen-when-empty. This becomes the OLX-style banded
discovery: within the user's max radius, rank **nearest band first, expand outward** with result
**sufficiency** ("18 more within 5 km"). Centralised in the geo layer (Part 35 principle: one
foundation, not per-module). Home ranks smoothly (no band headings); search/category pages show
bands explicitly (Part 19). Category-aware defaults (Part 16): Food/Services close-first;
Jobs/Rentals/Property expand wider; Emergency always nearest verified.

## 5. Legal / safety guardrails (Parts 5, 28, 29, 51) — non-negotiable

- **No blind scraping** of Google/Justdial/Zomato/Naukri/etc. Order of preference: open data →
  licensed APIs → official feeds → partnerships → business submissions → users.
- Every connector is **gated** by the `DataSource` licensing checklist before it can run in prod.
- **AI never invents** local events/deals/jobs/emergencies/community posts (Part 29). AI is
  classify/extract/summarise/dedupe only.
- **Official alerts** (NDMA/SACHET, govt) stay verbatim + labelled; never reworded (Part 28, 34).
- **Community / Local Requests are never fabricated** (Parts 54, 57) — sparse is fine.

## 6. Phased roadmap (maps to prompt Parts 52–58; ordered to reuse + de-risk)

- **P0 — Assessment (this doc).** ✅ existing architecture catalogued above.
- **P1 — Foundations (Part 53).** `DataSource` registry + licensing admin, `SourceRawRecord`,
  connector interface, provenance block, `media_origin`, `DistanceBandConfig`, `City.launchState`,
  `AreaCoverage`, dedup framework (confidence + admin review queue). _Migrations + admin screens;
  no user-facing change._
- **P2 — First connector, one launch city (Part 54).** OSM POI import for the launch city →
  dedupe against the **existing 4M directory** → canonical `Business`. Prove the whole pipeline
  end-to-end on real data before adding sources. Coverage dashboard lights up.
- **P3 — Progressive distance discovery (Part 55).** Ship banded discovery + sufficiency across
  feed/search; category-aware distances; test 1-result and 1000-result localities. _This also
  finishes the "web feed vertical like Instagram" item — the merged Around-You-Now column._
- **P4 — Dynamic sources (Part 54).** Weather (short TTL) → Local Now; permitted jobs/events
  feeds where Indian coverage is real. Freshness engine per source.
- **P5 — Business claiming expansion (Part 56).** Turn imported POIs into claimed first-party
  profiles at scale — the flywheel's key turn.
- **P6 — First-party/user modules (Part 57).** Marketplace/Local Requests/Community/Rentals/etc.
  already exist as types; wire empty-state → demand loops (Part 40): "no plumber → post a Local
  Request". **No fabricated content.**
- **P7 — Retention (Part 58).** Saved searches → alerts → Local Pulse → coverage analytics →
  business demand feed (providers see nearby requests).

## 7. What to build first (recommended P1 slice)

1. `DataSource` model + admin CRUD + the licensing checklist (Part 51) — _gate before any fetch_.
2. `SourceRawRecord` + the `SourceConnector` interface + one BullMQ ingestion queue.
3. Provenance block + `media_origin` enum (migrations only; back-compatible).
4. Coverage/cold-start scaffolding (`AreaCoverage`, `City.launchState`).

All additive migrations, no user-facing regression, and each is independently verifiable
(`typecheck` + tests). Only after P1 lands do we run the first real connector (P2).

## 8. Open decisions for the product owner

- **Launch city/cities** to seed first (drives P2 scope).
- **Source budget/licensing**: which of OSM (self-hosted extract vs Overpass), a paid POI
  provider, weather, jobs/events APIs are approved for commercial use in India — each needs a
  terms review recorded in `DataSource` before it runs.
- **Object storage**: stay on the current MinIO, or move LocZ uploads to R2/S3 + CDN (Part 25)?

---

## 9. Owner decisions (answered 2026-08-18) + storage sizing

**(1) Coverage = all-India pincodes.** The schema/geo layer already supports the whole country;
pincode is metadata, discovery is lat/lon + distance (Part 62). Ingestion runs per **geo cell**,
not per pincode. Roll cities out via `City.launchState` (SEEDING→ACTIVE) even though the DB
covers all pincodes — density-first beats thin nationwide coverage.

**(2) Sources — chosen defaults (each still gated by the `DataSource` licence checklist):**

- **Now:** OpenStreetMap / Overpass for POI seed (open data, ODbL, attribution shipped in the
  connector). This alone seeds Businesses/Food/Health/Services/Play/Mobility.
- **Next:** OpenWeather free tier → Local Now (display-only, short TTL, no storage).
- **Deferred until terms + real Indian coverage are reviewed:** Foursquare/paid POI, paid
  jobs/events (Adzuna/Ticketmaster), NDMA SACHET, data.gov.in. None run until their row's
  `termsReviewed`+`commercialUse`(+`storagePermitted`) are set — enforced by
  `sourceMayRunInProduction()`.

**(3) Storage sizing (all-India):**

| Layer                                                              | Estimate                                                                              | Where                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------- |
| Canonical structured entities (~15–20M POIs incl. the existing 4M) | ~80–150 GB incl. GiST/trigram indexes                                                 | Postgres                                |
| Raw ingestion (`SourceRawRecord`, jsonb)                           | ~40–80 GB (prune after processing)                                                    | Postgres                                |
| **→ provision**                                                    | **~250–500 GB Postgres volume for national scale** (launch-city seed is only ~1–5 GB) | Postgres                                |
| LocZ-uploaded media (business/user photos)                         | ~hundreds of GB at scale, grows with users                                            | **Object storage (R2/S3), NOT the VPS** |
| External media                                                     | **0 on VPS** — reference-only per source rights (Parts 23–24)                         | —                                       |

Current VPS Postgres is small and fine for the **launch-city seed**. Before national ingestion:
grow the DB volume and move LocZ uploads to R2/S3 + CDN (the MinIO abstraction already exists).

## 10. P1 status — DELIVERED (2026-08-18)

Built + verified (typecheck clean, 562 API tests): `DataSource` registry + **licence gate**
(`sourceMayRunInProduction`), `SourceRawRecord` raw layer, `SourceConnector` interface, a pure
**dedup confidence scorer** (Part 8), OSM→canonical **category map**, the **OSM Overpass
connector** (pure `normalize`), admin endpoints (`/admin/data-sources`), and the additive
migration `20260818000000_data_engine_foundations` (new tables/enums only — no change to the
4M-row `Business`/`City`). Next: apply the migration on the VPS, then P2 (run the OSM connector
for the launch city through the dedup→canonical pipeline).
