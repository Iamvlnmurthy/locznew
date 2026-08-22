# LocZ Hyperlocal News Intelligence — Architecture

Status: **Phase 0 (design)**. This document is the contract for the phased build. It is
grounded in a repository inspection (file:line references are real) and must be updated as
each phase lands.

The one idea everything hangs on: **ingest once, match by location.** We never source news
per PIN code. We collect each article once, resolve the places it names to coordinates, store
one normalized event with a point, and let a PostGIS radius query at read time deliver it to
every nearby user — whatever their PIN code. New news each hour is just the scheduler's next
poll through the same path.

---

## 1. Existing architecture (what we build on, not around)

LocZ is a NestJS modular monolith (`@locz/api`) + Next.js web/admin + Flutter mobile, on
PostgreSQL 18 + PostGIS, Redis, BullMQ, Meilisearch, R2/MinIO object storage. Relevant seams:

**Live "pull-on-demand" layer — `apps/api/src/weather/` ("local-now"):** six services
(weather, news, jobs, deals, alerts, area-summary), all _ephemeral_: fetch on demand, cache in
Redis with a TTL, never persist, degrade to empty on failure. Notably:

- `local-news.service.ts` already pulls **Google News RSS** and has a hand-rolled
  `parseNewsRss` (`:34`). `local-alerts.service.ts` pulls **NDMA SACHET CAP RSS** (official
  emergency alerts) with a second, duplicated `parseAlertsRss` (`:48`). These two duplicate
  regex RSS parsers are the consolidation seam.
- All are `@Public()` under the `local-now` controller prefix.

**Persist-side framework — `apps/api/src/data-engine/`:** already built for exactly this
shape, but only the registry/primitives exist (no running pipeline yet):

- `DataSource` model (`schema.prisma:2091`) — a source registry with a **licensing gate**
  `sourceMayRunInProduction` (`data-source.service.ts:10`) requiring
  `enabled && termsReviewed && commercialUse`, plus `storagePermitted` for storage-bearing
  types. `WEATHER`/`ALERT` are display-only and skip the storage check.
- `SourceRawRecord` (`schema.prisma:2130`) — raw payload kept for reprocess/dedupe/audit;
  `@@unique([sourceId, externalId])`, `hash`, `h3`, `status`.
- `SourceConnector` interface (`connector.interface.ts:41`) — `fetch()` + pure `normalize()`
  - `healthCheck()`. One connector today: `OsmOverpassConnector`.
- `dedupe.ts` — pure `dedupeConfidence` (Jaccard name similarity + proximity + phone).
- Admin control plane at `admin/data-sources` gated on `category:manage`.

**Geography — `prisma/schema.prisma` + `GeoRepository`:**

- Admin hierarchy exists: `Country → State → District → City → Locality` + flat `Pincode`.
  `City` has `nameTe`/`nameHi` alias columns and lat/lng + `geo geography(Point,4326)`.
  `Locality` has a free-text `mandal` and lat/lng. `Pincode` PK is the 6-char code, with
  `districtName`/`stateName` as **strings** (not FKs), ~19,300 rows, centroid coords ~1–2 km.
- `locz_sync_geo()` trigger derives `geo` from lat/lng; GIST indexes on every geo column;
  trigram GIN indexes for name search.
- **`GeoRepository` (`src/prisma/geo.repository.ts`) is the ONLY sanctioned place for spatial
  SQL** (ADR-0003): `findNearbyListings`/`findNearbyPincodes`/`findNearestCity` use
  `ST_DWithin` + `ST_Distance`.
- Gaps for news geo-resolution: no mandal node, **no general alias table** (only City has
  native names), no admin boundary polygons, `Pincode` not FK-linked to District/State.

**Queue/scheduler — `apps/api/src/queue/` + `src/lifecycle/`:** BullMQ. `queue.constants.ts`
holds `QUEUE_*`/`JOB_*`. `LifecycleScheduler` registers **repeatable** jobs with a fixed
`jobId` (idempotent re-registration), gated on `SCHEDULER_ENABLED`, `tz: Asia/Kolkata`.
`LifecycleProcessor` (`WorkerHost`, `concurrency: 1`) switches on job name; every handler is
idempotent + bounded (`take: N`). Runs in a separate **`locz-worker`** pm2 process. Job
payloads carry only an id; the worker re-reads state (ADR-0005). `RedisService.setIfAbsent`
(NX) is available as a single-flight lock primitive.

**Media — `apps/api/src/media/`:** object storage (R2/MinIO) with deterministic keys, signed
uploads, magic-byte MIME validation, EXIF strip, WebP renditions, perceptual + content
hashing, `BlockedImageHash`, a moderation pipeline (`nsfwjs`/`rekognition`/`quarantine`
providers with a documented fail-open policy), and `MediaStatus`. SSRF posture and
size/decompression limits exist for the upload path. This is what news-media reuses.

---

## 2. Proposed news-system architecture

A new Nest module **`apps/api/src/news/`** in the same monolith. It reuses `data-engine`'s
registry + licensing gate, `GeoRepository` for all spatial SQL, BullMQ for scheduling, and the
media pipeline for images. Data flow:

```
Source (RSS/Atom/API/sitemap/gov feed)
   │  scheduler enqueues per-source fetch (adaptive interval, ETag/304)
   ▼
RawDocument (persisted, idempotent on content hash)
   │  extract → NewsArticle (title, summary, body*, lang, canonicalUrl, publishedAt)
   ▼                              (*body stored only if source policy permits)
Language detection (local lib) → article stays in original language
   │
Location resolution (dictionary → alias → transliteration → NER → LLM only if ambiguous)
   │  → resolved place(s) + confidence + coordinates
   ▼
Deduplication (URL → title → body → multilingual embedding → location+time+entity)
   │
NewsEvent (canonical: title, summary, category, severity, geo point, distribution radius,
   │        trust, first/last seen, source count)  ── one event, many articles
   ▼
Geo distribution: PostGIS radius (ST_DWithin) at read time → nearby-news feed API
```

Two display tiers, enforced by the source's `mediaPolicy`/licensing:

- **Default (unknown/commercial source):** headline + short factual summary + publisher +
  source link + time + category + location. No full body, no rehosted image.
- **Permitted (gov / licensed / LocZ-owned):** may store body and rehost media.

Ephemeral vs persistent is settled: **persist** Article + Event (needed for dedup, event
clustering, updates, history, and the nearby query), while the _public projection_ stays
link-and-summary by default. The old `weather/local-news` ephemeral path stays as a fallback
and is superseded for registered sources.

### Content regeneration — LocZ writes its own story, no redirect out

LocZ keeps the reader on-platform: the story page is `locz.in/news/<slug>`, not a bounce to the
publisher. That is only lawful if LocZ **regenerates** the content rather than reprinting it. A
regeneration step (the event-summary phase) takes the source article(s) for a clustered event and
produces LocZ's **own** canonical title + summary — a genuine synthesis in LocZ's words, reporting
the facts (which are not copyrightable), never a near-verbatim copy of the publisher's expression.
Guardrails, because AI rewriting is where both the legal and the cost risk live:

- **Faithful, not fabricated** — the summary states only what the sources support; no invented
  detail, no rumour promoted to fact (ties into the trust/verification engine).
- **Genuine synthesis, attributed** — paraphrase-close-to-original is still derivative, so the
  regeneration must abstract, and every event keeps a visible "via {source(s)}" credit.
- **Once per event, cached forever** — regenerate when an event is created/materially updated,
  never per view; the output is stored on `NewsEvent`. This is what keeps the LLM bill bounded.
- **Cheapest model that suffices, provider-abstracted** — a small/local model for routine
  summaries; a larger one only for the hard ones. Never coupled to one vendor.
- **Full text is the exception** — government / official / explicitly-licensed / LocZ-owned
  sources may carry full body verbatim; everything else is LocZ-regenerated summary + attribution.

**Regeneration provider (current):** a **local Ollama** on the dev machine, reached at
`http://localhost:11434`, zero marginal cost, behind a `RegenerationProvider` interface so a
hosted model can replace it later. **Model split by language:** `gemma2:9b` (5.4 GB) for
**Telugu/Indic** — qwen2.5:7b's Telugu grammar is not publishable, gemma2 writes natural,
grammatical Telugu (~35 s/event, ~15 tok/s, acceptable for a once-per-event cached job);
`qwen2.5:7b-instruct` (4.7 GB, ~4 s) for **English**. **Substance depends on the source, not the
model:** a headline-only feed (Google News RSS) gives the model nothing to summarize, so it pads
or hallucinates (it read "gold rally" as a protest and invented "fights broke out") — the fix is
the HTML body-extraction phase feeding the real article body; model choice only fixes grammar.
Caveats to design for:
(1) the machine is on ~09:30–21:00 only, so regeneration is a queue that drains during those
hours — events still ingest + geo-resolve + appear (headline + "via source") when the brain is
offline, and get their LocZ summary when it comes back; (2) **UTF-8 must reach Ollama through the
HTTP JSON body, never a shell arg** — Indic text passed inline via a shell is corrupted and the
model then hallucinates; the Nest HTTP client sends UTF-8 natively, so this only bit the CLI test;
(3) low temperature (~0.2) + a tight "only facts in the source" prompt, and still keep a
faithfulness check — an early run mislabelled an IT employee as "businessman".

### Retention — auto-delete after 7 days (bounded storage)

News is disposable: an event older than a week has served its hyperlocal purpose, and keeping
it forever grows the DB (and any cached media) without benefit. A daily off-peak lifecycle sweep
(mirrors `sweepSessions`/`sweepOrphanMedia`) enforces a rolling window:

- **`NEWS_RETENTION_DAYS` (default 7)** — env-configurable; a per-category override can come later
  (e.g. keep official disaster alerts longer), but the default is a flat 7 days.
- **Delete order, bounded batches, idempotent:** (1) `NewsEvent` where `latestUpdateAt < now −
N days` — so an event still receiving updates survives; cascades drop its
  `NewsEventArticle/Location/Update` rows. (2) `NewsArticle` past the window that no longer
  belongs to any event. (3) `RawNewsDocument` past the window. (4) rehosted media for deleted
  events goes through the existing media-cleanup path.
- **Frees space by design** — 22 Aug news auto-clears ~29 Aug; steady-state disk is ~one week of
  events, not an ever-growing archive.
- `LocationAlias` and `NewsSource`/`NewsFeed` are **never** swept — those are the durable assets
  (the place-name graph and the registry); only the time-bound content expires.

---

## 3. Files & modules to create or change

Create (`apps/api/src/news/`):

- `news.module.ts`, `news.controller.ts` (public feed), `news-admin.controller.ts` (admin).
- `sources/news-source.service.ts` (registry, extends `DataSource` usage), `sources/seed-sources.ts`.
- `ingest/rss.parser.ts` (**shared**, replaces the two duplicated parsers), `ingest/rss.connector.ts`,
  `ingest/sitemap.connector.ts` (Phase 6), `ingest/html-extractor.ts` (Phase 7),
  `ingest/http-fetcher.ts` (ETag/304, SSRF guard, size/timeout caps).
- `pipeline/article-extractor.ts`, `pipeline/language-detector.ts`,
  `geo/location-resolver.ts`, `dedup/event-dedup.ts`, `events/news-event.service.ts`,
  `feed/nearby-news.service.ts`.
- `news.scheduler.ts` + `news.processor.ts` (BullMQ, mirrors lifecycle).
- Tests under `apps/api/test/news/`.

Change:

- `prisma/schema.prisma` (+ one migration) — news models + a `LocationAlias` table.
- `src/queue/queue.constants.ts` — new `QUEUE_NEWS_*` + `JOB_*`.
- `src/prisma/geo.repository.ts` — add `findNearbyNewsEvents`, `resolvePlaceByName`.
- `src/config/configuration.ts` — feature flags + optional API keys (disabled by default).
- `docs/LIVE_LOCAL_DATA_PLAN.md` — note the persistent-news addendum (reconcile the strategy).

No Codex/UI files. Web/mobile feed cards are a later, separate slice in Codex's lane.

---

## 4. Database schema (Phase 1)

New models (all data-driven — no Telangana/AP-specific tables):

- **`NewsSource`** — the news view over a source. Either extend `DataSource` (add a `NEWS`
  type + feed/media columns) or a dedicated table FK-linked to `DataSource`. Chosen: a
  **dedicated `NewsSource`** table (news needs feed lists, per-language, adaptive cadence, and
  media-rights columns that don't fit generic `DataSource`), with an optional `dataSourceId`
  link so the licensing gate is shared. Columns: name, domain, `sourceType`
  (RSS/ATOM/API/SITEMAP/NEWS_SITEMAP/HTML/GOV/ALERT), language, geo coverage (state/district/
  city ids, nullable), reliability, crawlAllowed, crawlIntervalSec, lastFetchAt,
  lastChangeAt, etag, lastModified, failureCount, status, plus media-rights columns
  (`mediaPolicy` enum, hotlink/download/rehost/attribution flags, license).
- **`NewsFeed`** — one row per feed/sitemap URL under a source (a source can have many).
- **`RawDocument`** — fetched payload, `@@unique([feedId, contentHash])`, idempotency anchor.
- **`NewsArticle`** — normalized: title, summary, body (nullable, policy-gated), lang,
  canonicalUrl (`@unique`), sourceUrl, publisher, author, publishedAt, updatedAt, imageUrl,
  detected category, `@@unique` on canonicalUrl for dedup level 1.
- **`NewsEvent`** — canonical title, summary, `category` (array), severity, `status`
  (VERIFIED/HIGH_CONFIDENCE/REPORTED/UNVERIFIED/DISPUTED/CORRECTED/RETRACTED), trustScore,
  relevanceScore, lat/lng + `geo geography(Point,4326)` (+ trigger + GIST), distributionRadiusM,
  adminCoverage (state/district/city), firstSeenAt, latestUpdateAt, sourceCount.
- **`NewsEventArticle`** — M:N event↔article with a per-link role (primary/supporting/syndicated).
- **`NewsEventLocation`** — event↔resolved place with confidence (an event can affect many).
- **`NewsEventUpdate`** — append-only version history (fire started → controlled → casualties).
- **`LocationAlias`** — `{ aliasNormalized, entityType (CITY/LOCALITY/DISTRICT/STATE), entityId,
language, source, confidence }`, unique on `(aliasNormalized, entityType, entityId)`, trigram
  index. The long-term asset: Madhapur = మాదాపూర్ = same point.
- **`NewsSourceHealth`** — rolling fetch/parse/error counters (or reuse `DataSource` health).

Indexes: GIST on `NewsEvent.geo` (mandatory), trigram on `LocationAlias.aliasNormalized`,
`@@unique` constraints for dedup, partial index on recent published events.

---

## 5. Queue architecture

New queues in `queue.constants.ts`, each a BullMQ queue with bounded concurrency + a DLQ:
`news-fetch-rss`, `news-fetch-api`, `news-fetch-sitemap`, `news-fetch-html`,
`news-extract`, `news-langdetect`, `news-georesolve`, `news-dedup`, `news-event`,
`news-translate`, `news-index`, plus a **separate high-priority** `news-emergency` queue and
worker pool so official alerts never queue behind video/image work. Media jobs live in their
own queues (Phase: media) so text ingestion always has operational priority.

Rules (mirroring lifecycle): payload carries only ids; every processor idempotent (re-running
never duplicates an article/event — enforced by the `@@unique` constraints, not by hope);
exponential backoff + jitter; DLQ after N attempts; per-domain rate limit + bounded
concurrency so one broken site can't block others.

---

## 6. Scheduler architecture

One `NewsScheduler` (`OnModuleInit`, `SCHEDULER_ENABLED`-gated) registering BullMQ **repeatable**
jobs — not OS cron, not per-source cron. A single dispatcher job runs frequently, queries
`NewsSource` for rows whose `nextFetchAt <= now`, and enqueues per-source fetch jobs. Interval
defaults live in **config** (env-overridable), starting from the spec's table (emergency 2m,
breaking 2–3m, national 3–5m, regional 5m, police 10m, utility 10–15m, district 15m,
municipal 30m, education 60m, discovery daily, deep-discovery weekly). **Adaptive:** each fetch
records publish volume; the interval is nudged up/down from observed cadence and backed off
on failure. ETag/`If-None-Match` + `Last-Modified`/`If-Modified-Since` → skip on `304`.
Multiple scheduler instances are safe because repeatable-job registration is keyed by a fixed
`jobId` and the dispatcher claims sources with a conditional `UPDATE ... WHERE nextFetchAt<=now`
(DB-level claim, no double-dispatch).

---

## 7. Source-adapter architecture

Every source is config + an adapter implementing the existing `SourceConnector` shape
(`fetch()` → raw, pure `normalize()` → `NewsArticle[]`, `healthCheck()`). Adapters:
`RssConnector`, `AtomConnector` (RSS variant), `NewsApiConnector` (optional, key-gated,
disabled by default), `SitemapConnector`, `NewsSitemapConnector`, `HtmlConnector` (last resort,
robots-gated), `GovAlertConnector` (SACHET/IMD/etc.). Prefer feed/API over HTML. **Respect
robots.txt, rate limits, terms; never bypass CAPTCHA/paywall/DRM/auth.** The `HttpFetcher`
centralizes SSRF defense (DNS-resolve + private-IP/metadata-endpoint block, redirect
validation, MIME allowlist, size cap, timeout), so no adapter fetches raw URLs directly.

---

## 8. Geographic intelligence architecture

Resolution ladder (cheap → expensive, LLM last):

1. **Dictionary** — exact/normalized match against City/Locality/District/State names.
2. **Alias table** — `LocationAlias` (Bombay→Mumbai, మాదాపూర్→Madhapur).
3. **Transliteration** — script-fold Telugu/Hindi/etc. to a comparable key (separate from
   translation; transliteration is what geo-matching needs).
4. **NER** — extract place candidates from title/summary/body.
5. **Disambiguation** — many Rampurs: score candidates by co-mentioned places, the source's
   normal coverage, district/state references, language, admin hierarchy.
6. **LLM** — only for residual ambiguity; provider-abstracted, replaceable.

Every resolution carries a **confidence**. High → hyperlocal (locality point). Low → pin only
at district/state level, never guess a neighbourhood. Unresolved places are stored and
reprocessed as the graph/alias table improves. All spatial writes/reads go through
`GeoRepository`; the nearby query is `ST_DWithin` on `NewsEvent.geo`.

---

## 9. Deduplication strategy

Layered, cheapest first; **never cluster on location alone** (two incidents can share a place

- time):

1. **URL** — exact canonicalUrl (`@@unique`) → same article.
2. **Title** — normalized/near-identical title within a time window.
3. **Body** — copied-body detection (shingle/hash).
4. **Semantic** — multilingual embeddings for cross-language matches
   ("Heavy rain in Hyderabad" ≈ "హైదరాబాద్‌లో భారీ వర్షం" ≈ "हैदराबाद में भारी बारिश").
5. **Event decision** — combine semantic + shared named entities + resolved location + event
   category + timestamps to decide same real-world event → attach as `NewsEventArticle`,
   else new `NewsEvent`. Later reports **update** the event (`NewsEventUpdate` history).
   **Syndication guard:** detect PTI/ANI attribution so 20 reprints ≠ 20 independent
   confirmations; store the originating agency; never promote rumour to "verified" by copy count.

---

## 10. Phased implementation plan

Each phase ends with `prisma validate` + `npm run build -w @locz/api` + `npm test -w @locz/api`
green, then a 360° mini-audit (correctness, dedup, security/SSRF, DB performance, crawler
compliance, geo accuracy, multilingual, cost) before the next.

- **P0 — this doc.** ✅
- **P1 — Foundation:** schema + migration; `NewsSource` registry (extends data-engine gate);
  **shared RSS parser** (kills the duplication); seed a few permitted RSS + the SACHET gov feed;
  RSS ingestion worker (idempotent persist); `LocationAlias` table + a first dictionary
  resolver; **nearby-news events feed API** (`ST_DWithin`). Tests: duplicate ingestion,
  repeated schedule, malformed XML, Telugu/Hindi/English content, radius query, queue
  idempotency, DB uniqueness.
- **P2 — Sitemap + news-sitemap ingestion.**
- **P3 — Generic HTML article extraction (robots-gated, structured-metadata-first).**
- **P4 — Gov/public-alert adapters (SACHET/IMD/traffic/DISCOM/water) → high-priority queue.**
- **P5 — Language detection + transliteration.**
- **P6 — India location graph depth (mandal node, alias importer, boundary polygons) + PIN importer reuse.**
- **P7 — Location resolution + disambiguation (+ LLM fallback, provider-abstracted).**
- **P8 — Article dedup (URL/title/body).**
- **P9 — Event creation, clustering, cross-language dedup, updates, trust/verification.**
- **P10 — Nearby feed ranking (distance+freshness+severity+trust), PIN/city/district/state APIs.**
- **P11 — Translation-on-demand (cache; proactive only for high-priority alerts).**
- **P12 — Source discovery (RSS/sitemap probing, robots) + weekly deep scan.**
- **P13 — News media (images/video) reuse of the media pipeline + rights columns + moderation.**
- **P14 — Observability, retries, DLQ, admin endpoints, security hardening.**
- **P15 — Comprehensive tests + nearby-feed load test.**
- **P16 — Web/mobile feed UI (Codex lane; card list on web, full-screen swipe on mobile).**

Reliability over exotic AI: a solid RSS→dedup→geo→feed path (P1–P10) is the product; the LLM
is a last-resort tie-breaker, never the spine.
