# LocZ Live Local Data — on-demand, ephemeral dynamic feeds

**Problem.** A new app with few users looks empty. If someone opens LocZ in their area and
sees nothing, they never come back. We must make every area feel _alive from day one_ — local
news, job updates, local happenings, publicly-available deals — even with zero LocZ users there.

**The core decision.** LocZ has two kinds of data, and they need **opposite** strategies:

|          | Stable data                                     | **Dynamic data (this plan)**                                                 |
| -------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Examples | Businesses, restaurants, clinics, schools, ATMs | Local news, jobs, events, deals, civic/weather alerts                        |
| Changes  | Rarely (months)                                 | Constantly (minutes–days)                                                    |
| Strategy | **Import once, keep**                           | **Never bulk-import. Pull live for the viewed area, cache briefly, expire.** |
| Status   | ✅ Done — 3.4M POIs imported                    | ⬅️ Build this                                                                |

Bulk-importing dynamic data for every pincode would be a stale scrap-dump: expensive, wrong within
hours, and legally risky. Instead we **fetch on demand for the area the user is looking at, hold it
in a short-lived cache for the session/window, and let it evaporate** — exactly the model already
proven by the **weather** strip (`weather.service.ts`: fetch met.no → Redis 10-min TTL → never
stored → degrade to null on failure). This plan generalizes that one service to every dynamic type.

---

## 1. Architecture — the Live Local Feed

```
User opens area  (lat, lng, radius)
        │
        ▼
  Resolve to a GEO-CELL  (geohash ~5 / H3 res-7 ≈ 1–2 km)   ← the cache key, not the pincode
        │
        ▼
  Redis cache hit for {cell}:{type}?  ──yes──►  serve instantly (already geo-tagged, deduped)
        │ no / stale
        ▼
  SINGLE-FLIGHT lock (one fetch per cold cell, not one per user)
        │
        ▼
  Live connectors (only those the licence gate permits):
     news · jobs · events · deals · alerts
        │
        ▼
  NORMALIZE → GEO-TAG (attach lat/lng + relevance radius) → DEDUPE
        │
        ▼
  Cache in Redis with a PER-TYPE TTL   ── TTL expiry == "delete when the window ends"
        │
        ▼
  Precise distance filter to the user's radius  →  serve
```

**Why cache by cell+TTL, not literally per-session.** "Delete when the user leaves" is the right
_intent_ — nothing dynamic is persisted long-term. But keying the cache to a **geo-cell with a short
TTL** (rather than to one user's session) means the _first_ person to open an area triggers the fetch
and everyone else nearby in that window reuses it, then it expires on its own. Per-session fetching
would re-hit every upstream API for every user and blow through rate limits within a day. Same
outcome you want (ephemeral, no permanent dump) — just shared and rate-safe. Result: **the user
queries our Redis, never 10 third-party APIs directly.**

**Storage.** Redis only (ephemeral). Dynamic items are **never** written to the canonical Postgres
`businesses`/entity tables. Optionally a tiny per-cell raw list for in-window dedupe — also TTL'd.

---

## 2. Sources, TTL & legality (India, verified)

Every connector is registered as a `DataSource` and **cannot run until its licence row is cleared**
(`termsReviewed` + `commercialUse` [+ `cachingPermitted`]) — the gate already shipped in the Data
Engine. Only permitted/official/open sources. **No scraping of blocked or ToS-restricted sites.**

| Area                       | Source (initial)                                | Free?    | Key needed | Cache TTL       | Notes                          |
| -------------------------- | ----------------------------------------------- | -------- | ---------- | --------------- | ------------------------------ |
| **Local Now — weather**    | met.no                                          | ✅       | none       | 10 min          | **already live**               |
| **Local Now — news**       | Permitted RSS / local-news feeds; NewsAPI (dev) | ✅/dev   | maybe      | 30–60 min       | must be **geo-tagged** (§3)    |
| **Alerts (civic/weather)** | NDMA SACHET, IMD, data.gov.in                   | ✅       | reg.       | 15–30 min       | official, verbatim, labelled   |
| **Jobs**                   | Adzuna API (search by keyword+location)         | dev tier | ✅         | 2–6 h           | India coverage decent          |
| **Events / Happening**     | Permitted event/venue feeds                     | varies   | varies     | until event end | India coverage thin — evaluate |
| **Deals**                  | LocZ business-generated + partner offers        | ✅       | none       | offer expiry    | becomes proprietary data       |

Paid/licence-restricted (Foursquare, Google Places) are **enrichment only** — never bulk-stored.

---

## 3. Geo-tagging dynamic items (the hard part that adds the value)

Generic news/jobs are not valuable; **"a road closure 600 m from you"** is. Pipeline per item:

```
Raw item ("Traffic diversion near Madhapur junction, 8am–8pm")
   │  AI extracts location + category + validity  (classification only — never fabrication)
   ▼
{ location: "Madhapur Junction", category: "traffic",
  starts: 08:00, ends: 20:00, confidence: 0.94 }
   │  geocode the extracted place → lat/lng
   ▼
attach { lat, lng, relevanceRadiusKm } → cache in the matching cell(s)
```

**AI rule (already in the plan):** AI may classify, summarize, extract locations/entities, dedupe,
tag — it must **never invent** a local fact. Every item keeps `source_url` + `published_at`.

---

## 4. It must never look empty — the fallback

If a dynamic source returns nothing for a cell, fall back to the **stable POI data we already have**,
so the area still reads as alive:

```
AROUND YOU  ·  Madhapur · 5 km
  Food 1,240 · Health 380 · Services 920 · Learning 140 · Play 60     ← from existing 3.4M POIs
LOCAL NOW
  🌧 Rain this evening · ⚠ Traffic diversion nearby · 📰 3 local updates ← live, ephemeral
JOBS  47 nearby   ·   HAPPENING  5 this weekend   ·   DEALS  12 offers  ← live, ephemeral
                    Can't find it?  → Post what you need
```

The POI counts are derived from data on hand (category → discovery-area map), so **there is always
something**, even before a single dynamic source is switched on.

---

## 5. Cost, speed & safety controls

- **Single-flight per cell** (Redis lock / BullMQ dedupe): 1,000 users in an area = **1** upstream fetch.
- **Independent lazy sections:** each type fetched separately with its own skeleton, so a slow/absent
  source never blocks the rest of the page.
- **Timeouts + degrade-to-empty** (weather's pattern): a failing source hides its section, never errors.
- **Per-source rate budget + usage/cost logging** on the `DataSource` row (API-cost monitoring).
- **Attribution + freshness** shown on every dynamic card ("MET Norway", "via Adzuna", "20 min ago").

---

## 6. Build phases

- **P0 — no keys, ships now.** Generalize `weather.service.ts` into a `LiveLocalService`
  (geo-cell key + per-type TTL + single-flight). Wire the **category → discovery-area** counts so
  ~10–12 areas populate from existing POIs immediately. Add lazy "Local Now" section shells with
  skeletons. _This alone fixes "the app looks empty"._
- **P1 — free / registration keys.** News (permitted RSS, geo-tagged) → Local Now; Jobs (Adzuna dev
  tier); Alerts (NDMA/IMD). Each behind the licence gate; ephemeral cache only.
- **P2 — evaluate & expand.** Events (assess India coverage/terms); Deals (business-generated, ties
  into the claim flywheel); civic (data.gov.in).
- **P3 — enrichment/geo-cells at scale.** H3/`AreaCoverage` cell index; optional paid POI enrichment
  after a terms review.

**What's needed from you** (only for P1+): pick which sources to approve, do the one-line terms
review per source, and hand over the free keys (Adzuna, NewsAPI if used). P0 needs nothing.

---

## 7. Relationship to `DATA_ENGINE_PLAN.md`

Same engine, different persistence: the Data Engine's `DataSource` registry, licence gate, geo,
dedupe, AI-classification rule, attribution and freshness all apply here — but **dynamic types stop
at the ephemeral Redis cache instead of being written to canonical Postgres.** Stable POIs persist;
dynamic feeds evaporate. That is the whole difference, and it is exactly the user's requirement.
