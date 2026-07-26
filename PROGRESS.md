# LocZ — Progress

Legend: ✅ done & verified · 🟡 authored, not yet verified · ⬜ not started

> **Verification note.** The whole backend stack now runs natively on this workstation —
> PostgreSQL 18.4 + PostGIS 3.6.2, Redis 8.8.1, Meilisearch and MinIO — and the
> **Phase 1 acceptance gate passes 35/35 end to end**. Still unverified: the Flutter app,
> which has never been compiled (no SDK here). Nothing is marked ✅ on the strength of
> "it looks right".

## M0 — Repository foundation

| Item                                                                           | Status                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------- |
| Monorepo layout (`apps/`, `packages/`, `infrastructure/`, `docs/`, `scripts/`) | ✅                                                |
| Root `package.json` with npm workspaces                                        | ✅                                                |
| `.gitignore`, `.env.example`                                                   | ✅                                                |
| `DECISIONS.md` (ADR-0001 … 0008)                                               | ✅                                                |
| `PROGRESS.md`                                                                  | ✅                                                |
| `README.md`                                                                    | ✅                                                |
| Docker Compose dev stack (postgis, redis, meilisearch, minio)                  | 🟡 authored — no Docker on this machine to run it |
| PostGIS init SQL (`infrastructure/database/init`)                              | 🟡 runs on first container start                  |
| Shared tooling config (tsconfig / eslint / prettier bases)                     | ✅                                                |
| Nginx reverse proxy config                                                     | ✅                                                |
| Husky pre-commit (format) + pre-push (typecheck, tests)                        | ✅                                                |

## M1 — Database

| Item                                                                                                                                                                | Status                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Prisma schema — 52 models across identity, geo, catalog, listings, trust, comms, ops                                                                                | ✅ passes `prisma validate`                                     |
| `apps/api/package.json` (dependency set)                                                                                                                            | ✅                                                              |
| Baseline migration `20260725000000_init` (generated offline via `prisma migrate diff`)                                                                              | 🟡 authored — needs a live PostGIS to apply                     |
| Migration `20260725000100_spatial_and_partial_indexes` — GiST, partial, trigram indexes, geo-sync triggers                                                          | 🟡 same                                                         |
| Seed: 9 roles, 2 states / 8 cities / 8 Hyderabad localities, 30 categories with dynamic attributes, banned keywords, expiry rules, system settings, 7 test accounts | ✅ typechecks against the generated client; ⬜ not yet executed |
| Shared tooling: `packages/config` tsconfig base, prettier config                                                                                                    | ✅                                                              |

Indexes that Prisma cannot express and which the first SQL migration must add:
`GIST(listings.geo)`, `GIST(cities.geo)`, `GIST(businesses.geo)`,
`UNIQUE(saved_locations.user_id) WHERE is_default`,
`INDEX(listings.status, expires_at) WHERE status = 'PUBLISHED'`,
trigram indexes on `cities.name` and `listings.title` for admin substring search.

## M2 — Core backend

| Item                                                                                                                                                   | Status                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Config module — Zod-validated env, refuses to boot on a missing secret or `OTP_PROVIDER=mock` in production                                            | ✅                                         |
| Prisma module + `GeoRepository` (the only PostGIS SQL in the codebase)                                                                                 | ✅ compiles; ⬜ spatial queries unexecuted |
| Redis module — client, fixed-window counters, idempotency helper                                                                                       | ✅                                         |
| OTP: provider interface, mock provider, MSG91 provider, issue/verify with per-phone + per-IP limits and DB-backed lockout                              | ✅                                         |
| Auth: OTP sign-in (account created on first verify), email+password, refresh rotation with family revocation, device registration, logout / logout-all | ✅                                         |
| RBAC: global fail-closed JWT guard, permissions guard, role resolution, `@Public` / `@OptionalAuth`                                                    | ✅                                         |
| Users: profile, devices, device revocation, deactivate, deletion request                                                                               | ✅                                         |
| Cross-cutting: correlation-id middleware, response envelope, unified exception filter, pagination helpers, audit service with redaction                | ✅                                         |
| Health probes (`/health/live`, `/health/ready`)                                                                                                        | ✅                                         |
| Bootstrap: helmet, CORS allowlist, URI versioning, strict validation pipe, Swagger (non-production only)                                               | ✅                                         |

Verified this milestone: `npm run typecheck -w @locz/api` clean, `nest build` emits `dist/main.js`.
Not verified: nothing has been booted — the DI graph, migrations and every database round trip
need Postgres and Redis running.

## M3 — Geo, categories, dynamic attributes

| Item                                                                           | Status |
| ------------------------------------------------------------------------------ | ------ |
| City search, city-by-slug, localities, coordinate→city resolution (150 km cap) | ✅     |
| Saved locations with exactly-one-default enforcement and promotion on delete   | ✅     |
| Category tree assembled in one query; attribute inheritance from ancestors     | ✅     |
| Server-side validation and coercion of dynamic attribute values                | ✅     |
| Admin category and attribute management behind `category:manage`               | ✅     |

## M4 — Listing engine, marketplace, media, moderation

| Item                                                                                                                                               | Status |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Listing create with per-type extension, dynamic attributes, city-centre coordinate fallback                                                        | ✅     |
| Lifecycle: draft → submit → pause / resume / sold / republish / soft delete                                                                        | ✅     |
| Save / unsave (idempotent), recently viewed, my listings                                                                                           | ✅     |
| Browse + filter, radius search via PostGIS, price/condition/category filters, sorts                                                                | ✅     |
| Media: signed upload URLs, magic-byte re-validation, EXIF-orientation + metadata strip, thumb/card/full WebP, reorder, delete with cover promotion | ✅     |
| Moderation: provider interface, rules engine, screening on submit and on edit, queue, approve/reject/remove, per-role daily posting caps           | ✅     |
| Re-moderation when a published listing's text is edited                                                                                            | ✅     |

Verified this milestone: `npm run typecheck` clean, `nest build` clean, **9 tests passing** —
a DI-graph test that compiles the real `AppModule` with only Prisma and Redis stubbed, and
8 moderation-threshold tests pinning approve / review / reject behaviour.

## M5 — Search indexing, feed, background jobs

| Item                                                                                                              | Status |
| ----------------------------------------------------------------------------------------------------------------- | ------ |
| BullMQ wiring — three queues, exponential backoff, retained failures                                              | ✅     |
| Meilisearch: index settings applied at boot, document builder, upsert-or-remove, batched full rebuild             | ✅     |
| Index sync on every lifecycle transition and moderation decision                                                  | ✅     |
| `/search` — typo-tolerant keyword search, facets, geo radius, sorts, **database fallback when the index is down** | ✅     |
| Admin index status (drift) and rebuild endpoint                                                                   | ✅     |
| Location-aware home feed — 8 rules-based sections, widening radius, city fallback chain                           | ✅     |
| Lifecycle jobs — expiry, expiry warnings, orphan-media sweep, session sweep, nightly reindex                      | ✅     |
| Notifications — in-app synchronous, push queued, preference matrix, FCM v1 provider with token cleanup            | ✅     |
| Worker entrypoint (`dist/worker.js`) sharing the API image and module graph                                       | ✅     |

Verified: typecheck clean, build emits both `dist/main.js` and `dist/worker.js`, 9 tests passing
with the full graph (BullMQ + Meilisearch + scheduler) resolving in the DI test.

Fixed this milestone: `tsBuildInfoFile` sat outside `dist`, so `nest build --deleteOutDir`
wiped the output but kept the incremental cache — tsc then skipped emitting `main.js` and
produced a silently incomplete build.

## M6 — Admin dashboard

| Item                                                                                                                          | Status      |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `packages/ui-tokens` — colour/type/spacing/radius/shadow tokens, CSS custom properties, light + dark + compact density        | ✅          |
| Dart token generation from the same TypeScript source (36 colours → `apps/mobile/.../tokens.g.dart`)                          | ✅ executed |
| `packages/shared-types` — enums, response envelope, domain payloads, moderation-reason labels                                 | ✅          |
| API admin module — metrics, listings by city/category, daily volume, most viewed, user directory, queue depth, storage stats  | ✅          |
| Console: email/password sign-in, httpOnly cookie session, server-only API client                                              | ✅          |
| Overview — 12 metrics, city/category bar lists, queue health, index drift; each panel degrades independently                  | ✅          |
| Moderation queue — automated reasons in plain English, first-listing flag, approve/reject with mandatory poster-facing reason | ✅          |
| Listings browser, user directory with search, category tree with translation gaps, system page with index rebuild             | ✅          |

Verified: `next build` clean — 8 routes, 103 kB shared JS, types checked by the build.
API typecheck clean and 9 tests still passing.

## M7 — Public web app

| Item                                                                                                                 | Status |
| -------------------------------------------------------------------------------------------------------------------- | ------ |
| i18n — English catalogue complete, Telugu and Hindi for navigation and key flows, English fallback per key           | ✅     |
| Locale from cookie + `Accept-Language` negotiation; `<html lang>` set for screen readers                             | ✅     |
| Layout, header with large search + location chip, footer, design tokens shared with admin                            | ✅     |
| Home feed — category strip, rails per section, works signed out                                                      | ✅     |
| Listing detail — `generateMetadata`, Open Graph, Product JSON-LD, deindexed when not published                       | ✅     |
| City (`/in/[city]`) and category (`/c/[slug]`) landing pages, cached and crawlable                                   | ✅     |
| Search with filters, sorts, radius and pagination (deliberately `noindex`)                                           | ✅     |
| OTP sign-in — two steps, `autocomplete="one-time-code"`, dev code surfaced from the mock provider                    | ✅     |
| Posting flow with direct-to-storage upload, real progress, per-file retry                                            | ✅     |
| Dashboard — my ads with status-aware lifecycle actions, saved ads                                                    | ✅     |
| Location picker — GPS optional, city-level browsing first-class                                                      | ✅     |
| `robots.txt` and `sitemap.xml` (cities + categories; listings excluded — they expire)                                | ✅     |
| API conversations module — enquiry threads, one per buyer per listing, blocking, rate limit, notification on message | ✅     |

Verified: `next build` clean — 12 routes, 103 kB shared JS; API typecheck clean; 9 tests passing.

## M8 — Flutter mobile app

**All 🟡 — there is no Flutter SDK on this machine. Nothing below has been compiled, analysed
or run.** Verify with `flutter pub get && flutter analyze && flutter run` before trusting it.

| Item                                                                                                                              | Status        |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `pubspec.yaml`, `analysis_options.yaml` (strict lints), feature-first structure — 25 Dart files                                   | 🟡            |
| Theme built from the generated tokens, light + dark, 48dp tap targets                                                             | 🟡            |
| `ApiClient` — token attach, **single-flight refresh** so parallel 401s cannot burn a rotating refresh token                       | 🟡            |
| `TokenStorage` — Keystore/Keychain only, stable per-install device key                                                            | 🟡            |
| i18n — English/Telugu/Hindi maps with English fallback, no inline strings                                                         | 🟡            |
| Riverpod composition root; feed refetches on city change and on sign-in                                                           | 🟡            |
| Screens: home feed, search (debounced), listing detail, OTP sign-in, posting + upload, city picker, chats, account, notifications | 🟡            |
| Direct-to-storage upload with per-image progress, sequential to stay usable on mobile data                                        | 🟡            |
| Push service — permission requested after a meaningful action, not at first launch                                                | 🟡            |
| Deep-link paths mirror the web app (`/ad/<slug>`) so one link serves both                                                         | 🟡            |
| API `POST /users/me/push-token` added so rotated FCM tokens can be re-registered                                                  | ✅ typechecks |

Caught in self-review (no compiler available): `_ListingsTab` declared a plain
`FutureProvider` parameter while receiving `autoDispose` providers — corrected to
`AutoDisposeFutureProvider`. Expect `flutter analyze` to surface more of this class of issue.

## M9 — Saved items, enquiries, notifications

Delivered across M4, M5 and M7 rather than as a separate milestone:
saved/unsaved with idempotent counters, recently viewed, enquiry threads (one per buyer
per listing) with blocking and rate limiting, and the unified notification system with
per-type/per-channel preferences. All ✅ typechecked, ⬜ unexecuted.

## M10 — Deployment and documentation

| Item                                                                                  | Status                             |
| ------------------------------------------------------------------------------------- | ---------------------------------- |
| `Dockerfile.api` — multi-stage, non-root, healthcheck; one image for API and worker   | 🟡 authored, no Docker to build it |
| `Dockerfile.next` — shared by web and admin via `--build-arg APP`                     | 🟡                                 |
| `docker-compose.prod.yml` — migrations gate the API start; only Nginx publishes ports | 🟡                                 |
| Nginx — TLS, HSTS, tiered rate limits (OTP tightest), correlation-id propagation      | 🟡                                 |
| `docs/ARCHITECTURE.md` — system map, modules, data shape, security model, Phase 2     | ✅                                 |
| `docs/SETUP.md` — prerequisites, env, migrations, seeds, test accounts                | ✅                                 |
| `docs/MOBILE_SETUP.md` — platform generation, permissions, Firebase, release builds   | ✅                                 |
| `docs/ACCEPTANCE.md` — the 12-step end-to-end run with SQL checks                     | ✅ written, ⬜ never executed      |
| `docs/TROUBLESHOOTING.md` — symptom → cause → fix across nine areas                   | ✅                                 |
| ESLint base config, husky hooks, lint-staged                                          | ✅                                 |
| README rewritten with an explicit verification-status section                         | ✅                                 |

## M11 — Gap closure (2026-07-26)

Work found missing on review of the Phase 1 brief against what was actually built.

| Item                                                                                                                                                          | Status      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Reports module** — user reporting of listings/businesses/users/messages, auto-escalation at 3 reports, moderator resolution notifying every reporter        | ✅          |
| **Businesses module** — free registration, staff with permission sets, opening hours, verification (admin-only), soft delete cascading to listings            | ✅          |
| **All nine listing types accepted** — `ListingDetailsBuilder` handles job, offer, service, rental, event and buyer-requirement payloads, not just marketplace | ✅          |
| `packages/validation` — Zod schemas and limits shared by API and frontends                                                                                    | ✅          |
| `packages/api-client` — hand-written typed SDK (ADR-0011)                                                                                                     | ✅          |
| Idempotency interceptor (ADR-0010)                                                                                                                            | ✅          |
| Sentry-compatible error reporter with field scrubbing, wired into the exception filter                                                                        | ✅          |
| OpenAPI export committed — **80 paths, 78 schemas** in `docs/openapi.json`                                                                                    | ✅ executed |
| Web: `/report` page (the listing page linked to a 404), plus about / help / safety / terms / privacy                                                          | ✅          |
| Admin: reports queue and audit-log viewer with per-entity history                                                                                             | ✅          |
| Test factories, 75 tests across 6 suites including an HTTP-contract e2e suite                                                                                 | ✅          |

### Defects this round found

1. **`app.init()` hung indefinitely.** BullMQ opens its own Redis connection regardless of
   the injected `RedisService`, and both `SearchService` and `LifecycleScheduler` awaited
   network calls in `onModuleInit`. In production that means an unreachable Meilisearch or
   Redis delays the API accepting traffic. Both hooks are now fire-and-forget, and
   `SCHEDULER_ENABLED` controls which single process registers repeatable jobs.
2. **Inconsistent error codes.** Nest's built-in 404 emitted `"Not Found"` while ours
   emitted `"NotFound"`. A client switching on `error.code` would break depending on which
   layer threw. Codes are now normalised in the exception filter.
3. **`process.exit` swallowed the OpenAPI export's own error message** on Windows,
   producing a silent failure. Replaced with `process.exitCode`.

## M12 — Database operations and dead-code removal (2026-07-26)

| Item                                                                                                                                                              | Status                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `scripts/verify-db.sh` — 18 post-migration checks: extensions, 53 tables, GiST and partial indexes, geo triggers, coordinate-order sanity                         | ✅ authored, `bash -n` clean |
| `scripts/backup.sh` — `pg_dump -Fc`, verifies the dump with `pg_restore --list`, refuses to rotate on an implausible table count, optional off-box upload         | ✅ same                      |
| `scripts/restore.sh` — restore into a throwaway database with row counts and a spatial-integrity check; typing the database name required to overwrite production | ✅ same                      |
| Connection pooling — explicit `connection_limit`, plus `directUrl` for migrations behind a transaction pooler                                                     | ✅ schema validates          |
| `RecentlyViewed` trimming job — the unbounded table flagged in the database review, now capped at 200 rows per user                                               | ✅                           |
| `@locz/validation` wired into the web posting flow, with per-field errors surfaced in the form                                                                    | ✅                           |
| `@locz/api-client` replaces admin's duplicated client; moderation and system actions use its typed methods                                                        | ✅                           |
| `docs/API.md` — conventions, rate limits, idempotency, endpoint groups                                                                                            | ✅                           |

Both shared packages existed but nothing imported them — a package that compiles and is
never used is dead code that looks like coverage. They are now on the real path.

## M13 — Client flows for the remaining Phase 1 modules (2026-07-26)

The API accepted all nine listing types, but the web posting flow only created
`PRODUCT` and business registration had no interface at all — so three Phase 1 modules
(local offers, job postings, business registration) were reachable only by curl.

| Item                                                                                               | Status |
| -------------------------------------------------------------------------------------------------- | ------ |
| Posting flow accepts 7 types — type chosen first, category list and fields follow from it          | ✅     |
| `listing-type-fields.tsx` — job, offer, service, rental, event and buyer-requirement blocks        | ✅     |
| `?type=JOB` deep-links straight to the right form                                                  | ✅     |
| Business registration (`/business/new`) — four required fields, live immediately                   | ✅     |
| Public business profile (`/b/[slug]`) with `LocalBusiness` structured data and opening hours       | ✅     |
| `businessId` search filter added end to end — the profile page would otherwise have listed nothing | ✅     |
| Listing-type labels in English, Telugu and Hindi                                                   | ✅     |
| Business registration linked from the footer and the sitemap                                       | ✅     |

Web is now **20 routes**.

## M14 — Live database, latest dependencies, brand slogan (2026-07-26)

### Database — now real, not authored

| Item                                                                                                                                                 | Status     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| PostgreSQL **18.4** + PostGIS **3.6.2** installed natively (portable binaries, no admin rights)                                                      | ✅ running |
| Cluster initialised with ICU `en-IN` collation — libc on Windows does not order Telugu or Devanagari correctly                                       | ✅         |
| Tuned `postgresql.conf`: `random_page_cost=1.1` so the planner will actually pick the GiST index, `auto_explain`, IST timezone, 200ms slow-query log | ✅         |
| `pg_hba.conf` on scram-sha-256 — the initdb default of `trust` would let anything on the machine connect as superuser                                | ✅         |
| Roles and databases: `locz` (NOSUPERUSER NOCREATEDB), `locz` + `locz_test` databases                                                                 | ✅         |
| Both migrations applied · seed executed (9 roles, 8 cities, 28 categories, 7 accounts)                                                               | ✅         |
| `verify-db.sh` — **all 18 checks pass**, including Hyderabad measuring 0.0 km from itself                                                            | ✅         |
| `backup.sh` — real dump taken and verified                                                                                                           | ✅         |
| `restore.sh` — real drill into a throwaway database, 7 users restored, GiST indexes intact                                                           | ✅         |

**Four real bugs the live database caught**, all invisible to a type-checker:

1. `CREATE INDEX ... WHERE "endsAt" > NOW()` — index predicates must be IMMUTABLE and
   `NOW()` is STABLE. PostgreSQL rejected the migration (42P17).
2. Prisma treats an **empty** `directUrl` as a validation error, not as unset — my
   `.env.example` comment said the opposite.
3. `DATABASE_URL` contains `&`, so `source .env` in a shell script split the value and
   spawned background jobs. It broke my own `backup.sh`. Values are now quoted.
4. `restore.sh` could not create a database because the application role is
   `NOCREATEDB` — correct security, broken script. It now takes a separate admin role.

Also corrected: the schema has **52 models (53 tables)**, not the 45 I had written in
five different documents.

### Dependencies — upgraded to latest

Every package moved to its newest release, then the fallout fixed:

| Change                                    | Consequence                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prisma 6 → **7**                          | URLs moved to `prisma.config.ts`; the client now connects via the `@prisma/adapter-pg` driver adapter                                                        |
| TypeScript 5.8 → **6.0.3**                | 7.0.2 is newer but its native compiler exposes no JS API, so **Next 16 and Jest transformers cannot consume it** — 6.0.3 is the newest the toolchain accepts |
| `moduleResolution: node` → `nodenext`     | TS 6+ removed the legacy node10 resolver                                                                                                                     |
| Next 15 → **16**, React 19.2              | both apps build                                                                                                                                              |
| Jest 29 → **30**, ts-jest → **@swc/jest** | ts-jest cannot drive TS 7; SWC is also ~2× faster (9s → 4s)                                                                                                  |
| Zod 3 → **4**                             | `errorMap` replaced by `error`                                                                                                                               |
| uuid 11 → **14** (ESM-only)               | Node 24 `require()`s it fine; Jest needed a transform allowance                                                                                              |
| meilisearch 0.49 → **0.60**               | `MeiliSearch` export renamed to `Meilisearch`                                                                                                                |
| Images                                    | PostGIS 18-3.6, Redis 8, Meilisearch v1.24, Node 24, nginx 1.29                                                                                              |

### Brand

Slogan **"Find it here.. Deal it near.."** applied across web (page title, meta
description, Open Graph, home hero `<h1>`, footer, about page, city landing pages),
admin sign-in, the mobile string catalogue and README — translated into Telugu and Hindi
rather than transliterated.

## Final verification run (2026-07-26)

| Check                            | Result                               |
| -------------------------------- | ------------------------------------ |
| `npm run typecheck -w @locz/api` | ✅ clean                             |
| `npx jest` (apps/api)            | ✅ 9 passed                          |
| `npx nest build`                 | ✅ `dist/main.js` + `dist/worker.js` |
| `npx next build` (web)           | ✅ 12 routes                         |
| `npx next build` (admin)         | ✅ 8 routes                          |
| `npx prisma validate`            | ✅                                   |
| Dart token generation            | ✅ 36 colours written                |
| Anything needing Docker          | ⬜ not runnable here                 |
| Anything needing Flutter         | ⬜ not runnable here                 |

## M15 — Acceptance gate PASSED (2026-07-26)

The rest of the stack now runs natively alongside Postgres, so the end-to-end flow is
executed rather than described:

| Service              | Version      | How                                          |
| -------------------- | ------------ | -------------------------------------------- |
| PostgreSQL + PostGIS | 18.4 / 3.6.2 | portable binaries, no admin                  |
| Redis                | 8.8.1        | maintained Windows build, no service wrapper |
| Meilisearch          | latest       | single binary                                |
| MinIO + mc           | latest       | single binaries, `locz-media` bucket created |

`scripts/acceptance.mjs` is an executable version of `docs/ACCEPTANCE.md` — HTTP only, no
direct database access, exits non-zero on failure so it can gate a deploy. It has grown
with the product; the current count is recorded in M16 below.

### Three more bugs the running system caught

1. **All search indexing was silently dead.** BullMQ rejects a custom job id containing
   `:`, and every job used `index:<id>`. Because the publisher swallows enqueue failures
   by design, this appeared only as a log line — search would have stayed permanently
   empty in production, masked by the nightly rebuild. Separator is now a hyphen.
2. **`condition` and `brand` were modelled twice** — as first-class `MarketplaceDetail`
   columns _and_ as required dynamic category attributes. A valid listing was impossible
   to submit: the API demanded the same fact in two shapes. The duplicates are gone from
   the seed.
3. **The Prisma 7 seed had no driver adapter**, so `db:seed` failed outright.

Also fixed: `forRoutes('*')` → `forRoutes('{*path}')` for path-to-regexp v8.

## Acceptance gate — end-to-end marketplace flow

Mock-OTP sign-in → city selection → create marketplace listing → image upload →
moderation → admin approval → search indexing → visible on web + mobile →
saved by another user → enquiry sent → owner notified.

Status: PASSED 2026-07-26 — 61 assertions, 0 failures.

```
node scripts/acceptance.mjs
```

Covers: health · mock-OTP sign-in · role resolution · city and coordinate resolution ·
listing creation routed to review · spam auto-rejected · moderation queue with reasons ·
approval publishing · public visibility without a token · phone hidden by default ·
keyword search via Meilisearch · PostGIS radius search · home feed · idempotent saving ·
enquiry threading · owner notification · sold removing from the index.

Remaining for Phase 1 completion: the same flow on Flutter mobile, which needs an SDK
this machine does not have.

## M16 — Every pincode in India (2026-07-26)

"This app serves in every pincode." It now does, as data rather than a claim.

**19,238 pincodes imported** from the GeoNames postal dataset, covering 35 states and
union territories, 0 rows missing coordinates, 442 linked to a launched city. GeoNames
lists one row per post office (~155,000 rows); `prisma/import-pincodes.ts` collapses them
to one record per code at the centroid of its offices, taking the most common spelling of
the name, district and state. The import is idempotent.

A pincode is modelled as a point with a radius, not a boundary — the reasoning is in
`docs/ARCHITECTURE.md`. What that buys, concretely:

- `GET /locations/pincodes?q=` — typeahead by code or place name, launched cities first
- `GET /locations/pincodes/:code` — the code, its centroid, its live listing count and
  its neighbours within 10 km
- `POST /locations/resolve/pincode` — device coordinates to the pincode the user is in
- `POST /listings` accepts `pincodeCode` **instead of** coordinates: the centroid places
  the listing, the existing geo trigger and radius search work unchanged
- `GET /listings?pincode=` and `GET /search?q=…&pincode=` — search the area around a code,
  10 km unless a radius is given

Verified end to end: a listing created with a pincode and no coordinates is found by a
pincode search of that area, and is **not** found by a search of a code 1,500 km away.
That negative assertion is the one that matters — it proves the radius is real rather
than a filter being quietly dropped.

### One bug this found

`ListingSearchQueryDto.skip` is a getter on `PaginationQueryDto`. The first version of the
pincode resolution spread the DTO into a new object to add coordinates, which silently
dropped the getter and would have broken pagination on every pincode search. It assigns
onto the instance instead.

Acceptance suite: **61 assertions, 0 failures** — 12 of them new and covering pincodes.

### Web

The location picker takes a pincode alongside "use my current location" and the city
list, the posting form takes one for the ad, and the header chip shows the pincode back
to whoever typed it. A pincode outside every launched city still browses fine — the city
fields stay empty and the radius does the work, rather than snapping the visitor to a
city hundreds of kilometres away.

Verified against the running stack rather than assumed: with `500081` selected the
Hyderabad listing appears; with `110001` selected it does not. Strings are translated in
English, Telugu and Hindi.

### Mobile — compiled for the first time

A Flutter SDK turned out to be installed after all (3.41.5, with a working Android
toolchain), so the mobile app stopped being unverified code. `flutter analyze` reported
nine real errors that had accumulated unchecked; all are fixed:

- three provider inference cycles (`apiClient → auth → authRepository`) — the cycle is
  deliberate at runtime, so the fix is explicit type annotations, not restructuring
- `_EmptyFeed` was passed a `slogan` it never declared, so the empty home screen would
  not compile at all
- four unused imports, and a declared asset directory that never existed

The app also had no `android/` or `ios/` folder — it had never been built. Both are now
scaffolded, the application id is `com.locz.app`, core library desugaring is enabled
(`flutter_local_notifications` needs `java.time` on API < 26, which is a large share of
the Indian install base), coarse-location and notification permissions are declared, and
iOS carries the location purpose string without which the request is refused outright.
Inter ships as four static faces with its OFL licence, replacing a font declaration that
pointed at files nobody had ever added.

**`flutter build apk --debug` succeeds.** The pincode picker, pincode-scoped feed and
search are in, translated in all three languages, with unit tests over the area model.

### Run on a device — three bugs the emulator caught

Compiling is not running. On an Android 16 emulator against the live API:

1. **The location picker rendered as a blank screen.** The theme gives every filled
   button an infinite minimum width (`Size.fromHeight`), and a `Row` hands unbounded
   width to its non-flex children — so the pincode "Go" button asserted during layout and
   took the whole screen down with it. An explicit width reconciles the two.
2. **`/feed` rejected the `pincode` parameter outright** — 400, "property pincode should
   not exist". I had added the parameter to the web and mobile feed calls without adding
   it to `FeedQueryDto`, so the home feed was broken for anyone who chose a pincode, on
   _both_ clients. The web build passed and the page still rendered, because `apiSafe`
   swallows the failure; only running the mobile app made it visible. The feed now
   resolves a pincode to its centroid exactly as search does.
3. **The mobile chip showed the city** where the web header shows the pincode. It now
   shows back what the user typed.

Verified on device: pincode 500081 entered by hand, persisted across an app restart, and
"Near you" leads with Madhapur listings.

Also added `scripts/dev-stack.ps1` — PostgreSQL, Redis, Meilisearch and MinIO run as
plain processes, so a reboot left nothing running and the recovery was four
half-remembered commands. Now `dev-stack.ps1 start|stop|status`.

Not yet done: iOS, which needs a Mac.

## M17 — The admin console, exercised (2026-07-26)

`scripts/acceptance-admin.mjs` — **53 assertions, 0 failures**. It asks two questions
that fail independently:

**Does the API refuse admin work to people who are not admins?** Eleven of the
assertions are negative — an ordinary account and an anonymous request are each refused
by every `/admin/*` endpoint, and a moderator is refused the user directory. A console
that looks right while the API hands user records to any signed-in seller is worse than
no console at all.

One finding, and it was my own assumption rather than a defect: a moderator _can_ read
the audit log. That is deliberate — moderation decisions are reviewable and the person
making them can see the trail — so the suite now asserts it explicitly, which means a
future permission change has to be a conscious one rather than a silent drift.

**Does every page render real data?** A Next.js page whose API call failed still returns
HTTP 200 with an empty shell, so "the page loads" proves nothing — exactly the trap that
hid the `/feed?pincode=` 400 earlier. Each of the eight console pages is checked for a
value that can only have come from the database (a user's display name, an audit action,
the live user count) and for the absence of an error boundary.

## M18 — The deployment path, as far as this machine allows (2026-07-26)

Docker is not installed here and installing it needs administrator rights, so the compose
stack itself is still unbuilt. Everything that could be executed without a daemon, was —
and it found three defects that would each have broken the _first_ deploy rather than a
later one.

**`prisma.config.ts` was never copied into the runtime image.** Prisma 7 reads the
datasource URL from that file, not from `schema.prisma`, so the `migrate` service had
nothing to connect to. Fixed, and the file is now copied explicitly.

**The `prisma` CLI was pruned out of the image** by `npm prune --omit=dev`, while the
`migrate` service runs `npx prisma migrate deploy` from that same image — `npx` would
have tried to fetch the CLI from the registry at deploy time. It is now reinstalled at
the version the workspace pins.

**`shadowDatabaseUrl` was declared unconditionally.** Prisma validates the key whenever
it is present, so an unset `SHADOW_DATABASE_URL` became an empty string and failed
`migrate deploy` with "must start with the protocol postgresql://" — in production, where
a shadow database is neither configured nor wanted. It is now spread in only when set.
Verified both ways: `migrate deploy` with only the two production variables, and
`migrate status` with the development shadow URL present.

Also removed `--schema` from the compose migrate command: Prisma 7 takes the schema path
from the config file, and the flag pointed the CLI at a schema whose datasource block
deliberately carries no url.

### Nginx, actually running

A portable nginx 1.28 validated `infrastructure/nginx/nginx.conf` verbatim (`syntax is
ok`), then served the real thing on high ports in front of the live API, web and admin:

- HTTP → HTTPS redirect: 301
- TLS termination and `/api/` proxy: health check returns through it, correlation id
  carried as nginx's `$request_id`
- `locz.in` → web, `admin.locz.in` → admin: both 200
- HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` all present
- 12 MB body cap: a 15 MB upload gets 413

One defect fixed there too: **nginx answered a throttled request with 503**, meaning "the
service is broken", where the API answers 429, meaning "you are going too fast". Clients
back off on 429 — including this project's own Flutter client and acceptance suite — so
the two layers disagreeing about the name of the same event is a real bug. `limit_req_status
429` and `limit_conn_status 429` now make them agree; verified by driving the auth zone
past its burst and watching every rejection come back 429.

Still unverified, honestly: `docker compose build` and `up`. Nothing here proves the
images build.

## M19 — The web app, exercised (2026-07-26)

`scripts/acceptance-web.mjs` — **75 assertions, 0 failures**. The API suite cannot see
whether a page renders; this one opens every page a visitor actually visits and checks it
for a string that could only have come from the database, plus the absence of an error
boundary. Slugs and ids are read from the live API at startup, so a reseed does not break
the suite.

Covered: home, search, listing detail, category, city landing, location picker, sign-in,
the five static pages, 404s for unknown listings and cities, the four authenticated pages
redirecting when signed out, then dashboard, chats, notifications, posting, new business
and report rendering with a session — plus robots.txt, sitemap.xml and the web manifest.

Three assertions failed on the first run and all three were mine, not the app's: the
dashboard greets by first name, the report page takes `?listing=` rather than
`?listingId=`, and the sitemap deliberately excludes listing URLs because they expire
within 30 days and a sitemap full of dead links costs more crawl trust than the coverage
is worth. The suite now asserts that exclusion rather than contradicting it.

Also re-ran the buyer/seller suite against Codex's API changes to `businesses.service.ts`
and `conversations.service.ts`: 61 assertions, no regressions.

**Three gates, 189 assertions.** Between them they cover the API flow, every public and
authenticated web page, and the admin console including its authorisation boundaries.

## M20 — The jobs nobody watches (2026-07-26)

`scripts/acceptance-jobs.mjs` — **24 assertions, 0 failures**. Expiry, the expiry warning,
orphan-media cleanup, session pruning and the nightly reindex all run on a schedule, so a
broken one is invisible until a seller asks why their sold item is still on the site.

To make that testable — and because operations needs it anyway — administrators can now
run a maintenance job on demand:

```
POST /admin/jobs/:name/run      # job:run permission, 202 Accepted
```

It adds no capability the platform did not have; every one of those jobs already runs on
a cron. It removes a wait. After an incident, "the expiry sweep runs at quarter past" is
not an answer, and the alternative is someone opening a Redis client against production.
The job name comes off the URL, so it is checked against a fixed allowlist rather than
passed to the queue — 14 unit tests pin that, including path traversal and the
whitespace-padded near-miss.

The suite proves the chain end to end: a listing is created, approved, indexed, backdated
(the single direct database write in any gate — no API backdates a record, and none
should), swept, and then confirmed `EXPIRED` for its owner, gone from search, 404 in
public, with a `LISTING_EXPIRED` notification delivered. Then every other job runs, the
queue drains, no queue reports a failure, and a full search rebuild restores all 11
documents with zero drift.

### Two defects found while building it

**`npm run db:seed` could not work from a clean shell.** The seed read `DATABASE_URL`
from the environment and nothing loaded the repository-root `.env` — npm runs a workspace
script with the workspace as the working directory, so `dotenv/config` looked in
`apps/api` and found nothing. It surfaced as `SASL: client password must be a string`,
which names neither the file nor the variable. `prisma.config.ts` had the same blind spot.
Both now load the root `.env` explicitly, and the documented commands work as documented.

**Running the suites in sequence locked them out.** They share the seeded staff accounts,
and sign-in is rate limited per phone — correctly, since that limit is what stops an
attacker SMS-bombing someone. The wrong fix was to relax it. `scripts/lib/session.mjs`
instead makes the suites behave like a real client: sign in once, keep the session, prefer
a refresh over a new code, and reuse a cached session for the account whatever device it
was opened on. The backoff also reads the server's own "try again in N seconds" rather
than guessing.

**Four gates, 213 assertions**, plus 89 unit tests. One command each, all exiting non-zero
on failure.

## M21 — Sorting told the truth about price (2026-07-26)

Extending the web gate to check that filters _actually filter_ — by comparing the
rendered listing links against what the API returns for the same parameters — found a
real defect on the first run.

`sort=price_asc` returned ₹32,900 above ₹4,500. The browse path ordered
`[isFeatured desc, …then the user's sort]`, so featured listings prefixed every ordering.
Someone who asks for "price: low to high" and is shown the expensive phone first has been
given the wrong answer to a precise question, and would reasonably conclude the sort is
broken — because it was.

Worse, the two search paths disagreed. The Meilisearch ranking already puts `sort` above
`isFeatured:desc`, with the principle written next to it: _paid placement moves a listing
up among equally relevant results — it never outranks relevance itself._ The database path
violated the rule its sibling documented, so the same query sorted differently depending
on whether the user had typed a keyword.

Fixed so both paths agree:

- featured placement is a tie-breaker in the **default** view only, never a prefix to an
  explicit ordering — and the default view still leads with featured listings, asserted
- `relevance` no longer collapses into `newest`. An explicit "newest" is a choice; no
  choice at all is what earns a listing its boost, and the two were indistinguishable
- price sorts put listings **without** a price last in both directions. A job carries no
  price, and PostgreSQL would otherwise head "price: high to low" with all of them

The gate now checks page-versus-API agreement for price, condition, type, pincode and
sort, that each filter genuinely narrows the set, that an impossible filter returns
nothing rather than everything, and all three ordering rules above. **87 assertions.**

Worth stating plainly: the redesign of the search page did not cause this. It made it
visible, and the equivalence check is what turned "looks fine" into a specific defect.

## M22 — Filters, verified rather than compared (2026-07-26)

The review of the previous milestone was right, and the sharpest part of it was about the
gate I had just written: comparing the rendered page against the API proves the two layers
**agree**, not that either is correct. A radius search that silently dropped the buyer's
budget agreed perfectly with a page that rendered everything it was handed. Three defects
were sitting behind that blind spot — `pincode` combined with `priceMax`, `condition` or
`type` ignored the second filter, and `type=JOB` returned one listing while reporting
eleven.

The root cause was duplication: filters existed twice, once in Prisma for the plain browse
path and once in SQL for the radius path, and price and condition had only ever been added
to the first. Two dialects of the same rule is how that happens; a longer review is not the
fix. The shared `whereFor` builder now defines them once.

`scripts/acceptance-filters.mjs` — **55 assertions** — is the layer that would have caught
it. It trusts nothing the API says: the unfiltered set is fetched once, the expected result
of every filter is computed from it in plain JavaScript, and the API is held to that.

- **truth** — every returned listing genuinely satisfies the filter
- **coverage** — nothing that should have matched is missing
- **honesty** — `total` equals the number of listings that actually match
- **order** — the sequence is exactly right, not merely the right set

Each filter is first proven to be a _real_ test — a price ceiling that excludes nothing
would otherwise pass every assertion about it. Compound queries get their own section,
because that is precisely where each filter worked alone and the combination did not.
Pagination is checked for repeats, consistent totals and honest behaviour past the last
page, including inside a radius search where the slice and the count came from different
lists.

All 55 pass against the corrected implementation, as do the web gate (95) and the unit
tests (89).

**Five gates: 61 + 95 + 55 + 53 + 24 = 288 assertions**, plus 89 unit tests. Still missing,
and named honestly: browser-level interaction coverage for the lightbox, filter drawer,
optimistic save and undo — behaviour no HTTP gate can reach.

## M23 — Browser interactions that re-check themselves (2026-07-26)

`scripts/acceptance-browser.mjs` drives a real headless Chrome through the DevTools
protocol and exits non-zero on failure. It covers the behavior the HTTP gates cannot see:

- the mobile search drawer opens, locks the page, closes with Escape and carries an
  entered filter into the URL
- the listing gallery opens as an accessible modal, closes with Escape and releases its
  scroll lock
- the listing heart changes optimistically, then both save and unsave are confirmed
  against the authenticated API
- removing a saved-library card offers Undo, and both transitions are confirmed in the
  API rather than trusted from the DOM
- entering pincode `500081` redirects home with both the exact pincode and Hyderabad city
  identity in the persisted location cookie

The gate uses the seeded buyer and restores the touched listing to unsaved in `finally`,
so repeated runs do not accumulate fixture state. Chrome is auto-detected on Windows,
macOS and Linux, with `CHROME_PATH` as an override.

Verified twice against the live stack: **13 assertions, 0 failures**, with no browser
runtime errors. It is available as `npm run acceptance:browser` and is listed in the
release acceptance checklist.

**Six gates: 61 + 95 + 55 + 13 + 53 + 24 = 301 assertions**, plus 89 unit tests.

## M24 — Businesses people can actually discover (2026-07-26)

The polished public profile at `/b/[slug]` no longer depends on someone already knowing
its URL. `/business` is now a location-aware directory with text, city, category and
verification filters; useful ordering; clear opening-hour and verification states; and
a calm route from discovery into the full profile. The homepage, footer and sitemap all
provide honest entry points.

The API now exposes active business summaries through `GET /businesses`. Its public
response includes the address, description and hours the cards need, while preserving
Claude's concurrent address-persistence changes in business creation and editing.
Recommended results use live-listing activity and profile interest—never enum ordering,
which would accidentally have ranked rejected verification states first.

This surface checks itself in both durable gates:

- `acceptance-web.mjs` verifies a real database-backed directory and profile, then checks
  text, city, category, verified-only, empty-result and popularity semantics
- `acceptance-browser.mjs` verifies the real directory card, desktop and mobile overflow,
  framework error overlays and card-to-profile navigation

The browser gate passes **17/17**, including all earlier interaction coverage, with zero
runtime errors. Focused live API/SSR checks also pass **5/5**. The full web gate was not
re-run in this session because Claude's concurrent security gate held the shared OTP
rate limiter; its new public checks are syntax-checked and the affected live paths were
verified independently.

**Six gates: 61 + 109 + 55 + 17 + 53 + 24 = 319 assertions**, plus 89 unit tests.

## M25 — A business owner can finish what they started (2026-07-26)

The business flow now continues beyond a polished registration screen. Unfinished
three-step profiles are recovered from device-local storage, the final step provides a
plain-language review, and a successful creation clears the draft and routes into a real
owner workspace.

`/business/manage/[id]` gives owners one calm place to maintain:

- recognised name, category, city, address and business story
- public phone, WhatsApp, email and website
- all seven days of opening hours, including closed-day controls
- profile completion, verification state, public views and live listing counts

The dashboard has a dedicated **Businesses** destination, so the management route remains
discoverable after the success screen disappears. Material edits still pass through the
API's ownership and verification rules. Opening an owner workspace no longer increments
the public view counter; maintenance is not customer interest.

The browser gate creates a temporary business through the actual UI and removes it in
`finally`. It proves step guidance, draft recovery after reload, server-field validation,
API creation, draft cleanup, dashboard re-entry, management rendering, persisted edits,
desktop/mobile overflow and zero runtime errors. The expanded gate passes **27/27**.

Both production applications build, both typechecks pass, and the temporary acceptance
business is cleaned up after every run.

**Six gates: 61 + 109 + 55 + 27 + 53 + 24 = 329 assertions**, plus 89 unit tests.

## M23 — Trying to break it (2026-07-26)

`scripts/acceptance-security.mjs` — **51 assertions, 0 failures**. The only suite written
from the attacker's side: every assertion passes when an attempt is _refused_, because
"the guard is in place" and "the guard stops this request" are different claims and only
the second one is testable.

Two unrelated accounts are created and one spends the run reaching for things that are not
hers: editing, deleting, marking sold and attaching photos to another person's listing;
reading and posting into a conversation she is not part of; doing a moderator's job;
presenting a garbage token, a forged one and an `alg: none` one; reusing a session after
logout and a refresh token after it was spent; brute-forcing a verification code;
smuggling `status`, `isFeatured`, `moderationStatus` and `ownerId` past validation; putting
SQL in a pincode as a field and as a query parameter; and getting a `<script>` tag to
survive as executable markup.

A phone number is the prize on a classifieds site, so it is checked in six places — the
public listing, the same listing while signed in, a conversation payload, a search
response, the rendered page and the admin directory — rather than trusting one.

Everything held. Nothing needed fixing in the application.

### What did need fixing was the honesty of a 429

Three suites in sequence tripped the per-phone limit, and the only way for a client to
back off correctly was to parse an English sentence — _"try again in 321 seconds"_. The
global throttler said nothing at all. Every 429 now carries `Retry-After`: the OTP limiter
passes its real TTL (guarding against Redis answering -1 for no expiry or -2 for no key,
neither of which is a number of seconds), and `RetryAwareThrottlerGuard` asks the throttler
what it already knew. The Flutter client had the same problem and no way to fix it from its
side.

Two limits also had to be raised **locally**, and the shipped defaults deliberately were
not: every suite and browser test on this machine arrives from `127.0.0.1`, so they share
one bucket and throttle each other rather than any attacker. `.env.example` now explains
which figure matters in production and which one only misleads on a laptop. When a wait
would exceed three minutes the suites now stop and say which ceiling was hit, instead of
sitting silent for an hour — a hang and a rate limit look identical otherwise.

**Six gates, 339 assertions**, plus 89 unit tests and Codex's 27 browser tests.

## M26 — Business trust and delegated access (2026-07-26)

Business ownership now has a complete trust workflow rather than a decorative badge.
The owner workspace explains exactly which profile signals are missing, accepts a
verification request only when the profile is ready, and shows pending, approved and
correction-needed states without implying paid placement or guaranteed quality.

The operations console has a dedicated verification queue with search and status
filters, visible evidence, public-profile review, approval and rejection notes. Status
filtering happens in the API before pagination, so a pending business cannot disappear
merely because it fell beyond the first 50 public records. Decisions notify the owner
and immediately update the public profile.

Owners can also grant existing LocZ accounts clearly described Manager, Editor or
Responder access, and remove access behind an explicit second decision. The service,
not only the UI, enforces exact ownership. A newly created owner can manage staff
without refreshing a stale token.

The browser gate now proves incomplete verification is refused, a complete request
reaches pending, staff access is granted and removed, a non-owner receives HTTP 403,
an administrator verifies the business, the public trust signal changes, and the owner
receives the decision. It passes **35/35** with no runtime errors, alongside **89/89**
API unit tests and clean API, web and admin typechecks/builds.

**Six core gates: 61 + 109 + 55 + 35 + 53 + 24 = 337 assertions**, plus 51 security
assertions and 89 unit tests.

## M27 — The mobile app is a running product, not an unchecked source tree (2026-07-26)

The installed Flutter 3.41.5 and Android 36 toolchains were used to resolve the mobile
dependencies, migrate the language selector to Flutter's current `RadioGroup` API, and
fix every unawaited navigation warning and strict formatting issue. `flutter analyze`
now reports **zero issues** and the existing pincode contract suite passes **4/4**.

`flutter doctor -v` is fully green. The app compiles into a real debug APK, installs on
the dedicated `LocZ_Dev` Android 16 emulator, reaches the host API through `10.0.2.2`,
and renders seeded location-aware listings. The home, account, language and listing
detail surfaces were exercised on-device; logcat showed no Flutter exception, fatal
exception or layout overflow.

The remaining mobile quality gap is durable integration coverage for sign-in, search,
save and enquiry behavior. Coordinate-only emulator taps are not accepted as that
evidence because system UI can steal focus; the next gate should use Flutter semantic
finders and assert API state.

## M28 — A mobile buyer journey that checks itself (2026-07-26)

`integration_test/buyer_journey_test.dart` now runs the compiled application on the
Android 16 `LocZ_Dev` emulator against the real API. It establishes a seeded buyer
session through the real email-login endpoint, persists it through Android secure
storage, and proves the app restores that identity.

The test then verifies the live feed, account tabs, unfiltered search results, the
keyword empty state, another seller's listing detail and optimistic save. It polls
`GET /listings/saved` to prove both save and unsave reached the database, and teardown
restores the listing's original state even after a later assertion fails.

The gate passes **1/1** on-device, the Dart unit suite remains **4/4**, and
`flutter analyze` reports **zero issues**.

## M29 — Production should fail before traffic, not during it (2026-07-26)

Production deployment now has a secret-safe executable preflight, an HTTP-only ACME
bootstrap configuration, a pinned Certbot maintenance service, and a runbook covering
environment placement, TLS, migrations, health checks, renewal and rollback.

The preflight deliberately fails on this workstation with four honest blockers: Docker
is unavailable, the production Compose environment has not been created, and neither
TLS certificate file exists. No fake credentials or certificates were generated to
make the check green. The Certbot image tag was verified against its official registry.

## M30 — The release boundary checks the whole system (2026-07-26)

The shared Next.js Dockerfile now copies every internal workspace manifest required by
both applications before `npm ci`. Previously it omitted `@locz/validation` and
`@locz/api-client`, a defect local builds cannot reveal because the full monorepo is
already present. Production preflight now derives those internal dependencies directly
from each app manifest and fails if the image recipe drifts again.

`scripts/production-smoke.mjs` checks the deployed boundary rather than individual
processes: public TLS headers, API liveness and dependency readiness, keyword requests
actually using Meilisearch, zero/allowed index drift through an authenticated admin
session, hidden API documentation, admin anti-indexing/framing headers and logout
cleanup.

Against the split local origins, all six applicable application checks pass, including
zero search-index drift and session cleanup. The two remaining failures are intentionally
production-only Nginx headers (HSTS and admin `noindex`/`DENY`), which cannot be asserted
until the Docker/TLS stack is running.

## M24 — Four different amounts of power over one record (2026-07-26)

The security suite grew a section for business roles — **74 assertions total, 0 failures**
— because "owner", "manager", "viewer" and "stranger" are four different amounts of power
over the same record, and an authorisation table that has never been attacked is a claim
rather than a fact.

A stranger is refused everything: seeing who works there, editing, hiring, requesting
verification, deleting. A viewer — the most limited role — answers enquiries and nothing
else: not hiring, not firing, not editing the profile, not deleting, and not posting a
listing under the business name. A manager runs day-to-day work and still cannot hire or
delete, nor rewrite their own permissions row. Nobody verifies their own business, because
the badge is the trust signal buyers actually rely on.

Dismissal is checked as a live boundary, not a flag: a removed staff member is refused on
the very next request, and specifically cannot keep posting as the business they no longer
work for.

Everything held. Two of my assertions were wrong again, and one of them taught me something
worth keeping: verification cannot be requested from a bare profile, and the refusal names
what is missing — _"Complete opening hours before requesting verification"_. That is a real
product rule, so the suite now asserts the rule instead of contradicting it.

**Six gates, 362 assertions**, plus 89 unit tests and Codex's 27 browser tests.

## M25 — Fifty thousand listings, and two things that only break at scale (2026-07-26)

Nobody had measured anything, and with fifty-five listings nobody could: PostgreSQL
correctly ignores every index on a table that small, so a fast response proved nothing
about the design. `prisma/generate-load.ts` builds a realistically shaped dataset —
weighted heavily toward launched cities, thin across the rest of the country, every row
tagged so `--clean` removes exactly what it added.

**50,055 listings**, and the design holds: the radius search uses the spatial index, city
and pincode browse and the expiry sweeper never read the whole table, and every endpoint
answers well inside budget — home feed 31 ms, pincode area 87 ms, keyword search 9 ms,
page fifty only 1.2× slower than page one.

Two defects surfaced that fifty rows could never have shown.

### The same query returned different results

`sort=price_asc` gave a different twenty-fourth row between identical runs. Thousands of
listings share a price and a whole day's postings share a publication date, so rows tied on
every sort key — and PostgreSQL is free to return tied rows in any order, which a parallel
scan happily varies. The user-visible cost is specific and silent: page one ends at row 24
of one arrangement and page two begins at row 25 of another, so a listing appears twice
while another is never shown. Nobody reports that; they conclude the search is unreliable.
Every ordering now ends with the row id, which is a UUIDv7 and therefore unique and roughly
chronological.

### The button for fixing a broken search index did nothing

`POST /search/index/rebuild` answered `202 queued` and silently discarded the work. The
fixed job id was deliberate — it stops a double-click starting two full scans — but BullMQ
keeps finished jobs, so after the first successful rebuild the id was permanently taken and
every later request was dropped. The nightly repair still ran, on its own separate key,
which is what hid it. The remedy an operator reaches for when search is visibly broken was
the one thing that could not work. Freeing the id on completion and on failure fixed it:
**50,014 documents indexed in about forty seconds**. The jobs gate now runs the rebuild
twice and requires the second one to actually happen.

### And several of my own assertions

The filter gate computed its expectations by enumerating the whole database, which stopped
being possible at fifty thousand rows. It now discovers a slice small enough to enumerate
by probing real pincodes from the API, and applies that slice to every query — which makes
every assertion in it a compound query, exactly where the earlier defects lived. Two web
assertions assumed the newest listing appears on the home page and that `total` equals the
number of rows on the page; both were true only while one page was the whole answer.

**Seven gates, 379 assertions**, plus 89 unit tests and Codex's browser suite.

## M26 — The other way a secret gets out (2026-07-26)

The SMS provider work arrived with tests covering the response path: a failed send returns
a generic message and does not surface the code. That is the right first check. The second
channel is the log, and it is the easier one to leak by accident and the harder one to
notice — nothing fails, nobody is told, and the codes sit in a file that gets shipped to a
log aggregator and read by people who should never see them.

Six tests, in `otp-secret-handling.spec.ts`, spy on every logger level and assert that a
Twilio send writes none of: the verification code on success, the code when the gateway
rejects the send, either credential (auth token or API key secret, including the base64
form they travel in), or the subscriber's full number. Plus the guarantee the whole API
rests on — a real provider returns no `debugCode`, because the field is spread into the
response only when a provider supplies one.

**All six passed on the implementation as written**, which is the good outcome and also the
one that proves nothing on its own. So the provider was temporarily made to log the code,
the number and the password: **four of the six failed**, and the provider was restored. A
test that has never failed is decoration.

**102 unit tests**, seven gates, 379 assertions.

## M27 — Rehearsing the one failure that cannot be undone (2026-07-26)

Data loss is the only irreversible failure in this system, and the backup had last been
restored when the database held fifty-five rows and two migrations. It now holds fifty
thousand listings, PostGIS triggers, hand-written partial indexes and a rolled-back
migration in its history.

`scripts/restore-drill.sh` takes a backup, restores it into a scratch database beside the
live one, and compares what actually decides whether the application works afterwards —
not just row counts. **17 checks, all passing**: 59 tables, 179 indexes, 14 triggers, the
seven extensions, 50,056 listings each carrying a geo point, an identical radius-search
result, the spatial index still chosen by the planner, and the geo trigger still firing on
a fresh insert. The scratch database is dropped at the end; the live one is never touched.

The trigger check is the one worth keeping. Lose it in a restore and inserts still succeed,
coordinates simply stop becoming points, and nothing anywhere reports an error — the
symptom arrives days later as "my listing doesn't show up near me".

### Two checks that had gone stale, and one that was almost right

`verify-db.sh` asserted "53 tables" and "2 migrations" — both true when written, both
wrong now, and a verification script that cries wolf is one people learn to ignore. The
table count is now derived by counting models in `schema.prisma`, so it stays true as the
schema grows.

Replacing the migration count with "nothing is unfinished" then found something real-
looking: one row with `finished_at IS NULL`. It turned out to be the honest record of the
migration whose index predicate used `NOW()`, which failed, was rolled back, and was
re-applied. The dangerous state is narrower than I first wrote — started, never finished,
_and_ never rolled back — and that is what it checks now.

## M28 — A moderator could remove a listing but not stop the person (2026-07-26)

`user:suspend` was seeded to moderators and administrators. `UserStatus.SUSPENDED` existed.
Sign-in, refresh and token validation all checked for it. The admin dashboard counted
suspended users. And **nothing in the system could suspend anybody** — no endpoint, no
service method, no path from the permission to the status. The dashboard was counting a
number that could only ever be zero.

The gap matters because removing someone's listings does not stop them posting more. A
moderator handling a person who is harassing sellers could delete the evidence and nothing
else.

`POST /moderation/users/:id/suspend` and `/reinstate` close it, and the detail that makes
suspension real rather than notional is that **every session is revoked in the same
breath**. Sign-in checks the status, but a live access token would otherwise keep working
until it expired — handing the person being suspended another quarter of an hour to do
precisely what they were suspended for. Verified against a live session: the same token
that answered 200 a moment earlier answers 401, and posting is refused.

Listings are deliberately left alone. Hiding an account's content is a separate decision
with its own audit trail, and conflating the two makes both harder to undo.

Seven unit tests pin the behaviour — including that suspending an already-suspended account
is refused rather than silently revoking a session the person opened after being
reinstated — and eight probes attack the boundary: an ordinary account cannot suspend
anyone, an anonymous request cannot, a moderator cannot suspend themselves, and the target
account is untouched by a failed attempt.

### The suites learned to respect a limit rather than fight it

Opening a seventh account tripped the OTP endpoint's five-per-minute-per-IP throttle. That
figure is right for production — a person needs one code, sometimes two — so the fix was
not to raise it. Fresh sign-ins are now spaced twelve and a half seconds apart, which keeps
every suite under the limit by construction instead of hammering it and backing off.

Two assertions in the flow suite also had to grow up: "the listing is among the ten nearest"
held only while the neighbourhood was empty. Scoped to the run's own category, it tests the
product again rather than testing luck — and gained a check that the results really are
ordered by distance.

**113 unit tests. Seven gates, 388 assertions.**

## M29 — What the platform refuses to carry (2026-07-26)

The banned-keyword list was fifteen English terms aimed at scams. LocZ would have carried
ivory, prenatal sex-determination services, e-cigarettes, forged marksheets and betting ids
without noticing — and it auto-rejected "Unisex salon chair for sale", because `sex` was on
the list at severity 2 and matching was `String.includes`. Also refused: "Essex water
heater", and a carer advertising for a sexagenarian.

**197 terms, 27 categories, each naming the statute it rests on** — Wildlife Protection Act
1972, NDPS 1985, Arms Act 1959, PCPNDT 1994 (where advertising sex determination is itself
the offence), the Transplantation of Human Organs Act 1994, the Surrogacy and ART Acts
2021, PECA 2019's total ban on e-cigarettes, the Prize Chits Act 1978, Trade Marks and
Copyright, BNS 2023 forgery provisions, the Immoral Traffic (Prevention) Act 1956, the
Child Labour Amendment 2016, the Dowry Prohibition Act 1961. Written in the
transliterations people actually type — `ganja`, `katta`, `dahej`, `tezaab`, `satta`,
`ling janch` — because a site written in Hinglish is not served by a list that only knows
"cannabis".

Three structural rules catch what keywords cannot: a job advert that asks the candidate for
money (the commonest employment scam here, and rarely phrased the same way twice), personal
requirements in a job advert, and tenant filtering in a rental.

**131 terms auto-reject; 66 wait for a person.** The split is the whole design. Prescription
medicines, air rifles, antique coins, spy cameras and every discrimination term are held,
because a lawful trader might be advertising and because a wrong rejection is invisible to
us and final to the seller.

Beef and bhang are deliberately absent — both are lawful in parts of India, and a national
keyword ban would encode one region's law as everyone's. That reasoning, and the rest, is
in ADR-0013.

**37 tests**: every refused category, every held category, and seven listings that must be
left alone. Three of them fail against the old substring matcher and pass against the new
one — checked by reverting it, not assumed.

**154 unit tests.** The corpus needs a lawyer's review before launch; it is a developer's
reading of Indian law, written to be defensible rather than authoritative.

## M30 — Images, and what fingerprints cannot do (2026-07-26)

Nothing had ever looked at an uploaded picture. The pipeline checked the file really was an
image, stripped its EXIF and made renditions; moderation counted images and never saw one.
A photograph of ivory under the title "old bangle" published with nothing noticing.

Every image is now fingerprinted twice — SHA-256 for the identical file, and a 64-bit
difference hash for the same picture re-cropped, re-compressed or re-saved. That buys three
things: a moderator's refusal sticks (`POST /moderation/media/:id/block` records both
hashes, and a re-upload is refused during processing), the same photograph under a
different account flags the listing, and any image from an account with no history pulls
the listing back into review — because the words were judged before the pictures existed.

Nine tests, including the evasions that matter: re-compression, resizing and a change of
format all still resolve to the same picture.

### What it does not do, which is the more important half

**It cannot see what a photograph shows.** There is no classifier, and adding a
plausible-looking one would be worse than none — a control that is believed and does not
work is how illegal material stays up while everyone assumes it is handled. Content
classification needs a licensed provider; CSAM detection needs PhotoDNA or Thorn, which are
access-controlled and cannot be approximated. `docs/MODERATION.md` names what must be
procured and the reporting duties that come with it — IT Act s67B, IT Rules 2021
3(1)(b) and 4(4), POCSO ss19–20, where reporting is mandatory and failing to report is
itself an offence.

**And renditions are made public before anything assesses them.** Pulling a listing back
takes it off the shelf and out of the index; the object stays exactly where it was, and
anyone holding the URL keeps it. Fingerprinting closes the loop for a picture already
refused. It does nothing for the first upload of something new. The fix is quarantine-first
storage — private until approved, failing closed when the scanner is unavailable — which
Codex identified and is building.

A structural note worth keeping: `ImageModerationService` sits in its own module and talks
to the search _queue_ rather than to `SearchModule`. Media, search and moderation all
reference one another, and `forwardRef` repairs Nest's dependency graph while leaving the
ES modules to evaluate in a cycle — the second to load sees an uninitialised class. Two
suites failed exactly that way before the module was pulled out.

**163 unit tests.**

## M31 — Private until approved, proved over HTTP (2026-07-26)

Quarantine landed, and the acceptance suite was still asserting the behaviour it replaced:
"thumb rendition generated", "rendition publicly readable". Those were assertions that an
image became public the moment it was processed — which was the hole.

The suite now tests the guarantee instead. A new account's photograph is confirmed
`REVIEW_REQUIRED`, the uploader is told why in plain words, no public URL is handed out,
and the public gallery does not carry the image at all. Both of those last two are checked:
"no URL on the object" and "the object is not served" are different guarantees, and only
the second survives someone guessing a URL. Approval then publishes the renditions — WebP,
EXIF stripped, within the size cap — and **the original is still 403 afterwards**.

Two things had to be fixed to get there, neither of them Codex's implementation.

**A committed schema change with no migration.** `MediaStatus` had gained `QUARANTINED`,
`SCANNING`, `REVIEW_REQUIRED` and `REJECTED` in `schema.prisma`, and the code using them
shipped, while the database enum still had five values. Every listing approval returned a
500 reading `invalid input value for enum "MediaStatus"` — which looks like a database
fault rather than a missing migration. `20260726160000_media_quarantine_states` adds them
with `IF NOT EXISTS`, so it is safe on a database in either state.

**My own sequencing.** Approving the listing early to check renditions emptied the
moderation queue that two later sections are about. The rendition assertions now sit after
the approval the suite already performs, which also makes them test the real order rather
than a contrived one.

**189 unit tests. Acceptance 67, web 110.**

## M32 — The fingerprint was hashing the wrong bytes (2026-07-26)

Running the blocked-image probes end to end found the thing unit tests could not: **a
detailed photograph and a flat green rectangle produced the same hash — sixty-four zeros,
distance zero.** Blocking one would have refused the other.

Two separate faults, both mine.

**It never read luminance.** `sharp.greyscale()` desaturates but keeps three channels, so
indexing the raw buffer as one byte per pixel compared the red and green of the first few
pixels instead of brightness across the picture. `toColourspace('b-w')` reduces it for
real, and the stride is now asserted from `resolveWithObject` rather than assumed. My unit
tests missed it because every fixture was compared against a transformation of itself —
equally wrong on both sides.

**Distinctiveness was measured on the wrong thing.** The first fix marked an image
"distinctive" by its contrast, but these bits record whether each cell is brighter than the
one to its _right_. A white field above a black band has plenty of contrast and still
hashes to all zeros — which is exactly how an unrelated photograph came to be refused in
testing. Distinctiveness is now counted from the hash itself: fewer than twelve set bits,
or more than fifty-two, means it has recorded nothing to tell two pictures apart by, and
only the exact hash applies.

The direction of that trade is deliberate. Treating a real photograph as indistinct lets a
re-crop through; the reverse refuses a seller who did nothing wrong and tells them their
picture was previously removed.

### And the probes were poisoning their own database

The section blocks whatever it uploads, and a block is permanent by design — there is no
unblock endpoint, because reversing a safety decision should be a considered act rather
than an API call. An early version used the shared test photograph, which stayed refused
for every suite afterwards, including the main flow. Fixtures are now generated per run
from random rectangles: recolouring the same shapes yields the same bits, so the structure
has to change, not the palette.

Six hashes were cleaned out of the development database. The recovery is written into the
suite.

**Verified over HTTP:** the blocked picture is refused, a re-saved copy of it is refused,
and an unrelated picture is not. **222 unit tests, security 88, acceptance 67, web 110.**

## M33 — The wildcard opened the one door it should not (2026-07-26)

A `CHILD_SAFETY_OFFICER` role arrived with five permissions and no moderation or
administrative powers — restricted-case reading, evidence preview, report, release, close.
The separation is the whole point: access to that material is limited to named, trained
people and recorded with a justification.

**The super administrator's wildcard bypassed all of it.** `SUPER_ADMINISTRATOR` holds
`'*'`, the guard returned `true` before looking at what was being asked for, and a live
probe confirmed it: an account that does not hold `safety:evidence:read` opened the
restricted queue with a 200.

That credential is the one most likely to be shared during an incident, held by whoever
runs deployments, or issued to a contractor. "Root can do anything" is a convenience
everywhere else on this platform and a liability in this one corner. The five child-safety
permissions are now exempt from the wildcard — an explicit grant of the role, and nothing
else, confers them. Ten unit tests pin it, six of which fail against the previous guard.

**And nobody held the role.** It existed, correctly defined, with zero accounts attached —
the same shape as `user:suspend` being granted to moderators while no endpoint could
suspend anyone. In production that means an image held as evidence sits in a queue with no
reader, including for the report POCSO ss19–20 makes mandatory. A development officer
account is now seeded, and `docs/MODERATION.md` states plainly that production needs a real
one.

Eleven probes cover the boundary in both directions: the officer opens the restricted queue
and is refused the moderation queue, the user directory and platform metrics; a moderator
and an ordinary account are refused the restricted queue; the super administrator is refused
it **while still opening everything else**, because protecting one corner must not break the
platform around it.

**241 unit tests. Security 99, admin 53, acceptance 67.**

## M34 — The console had quietly lost its API (2026-07-26)

Checking whether the newly seeded child-safety officer could actually reach their workspace
— the concern being that a role which cannot load the console cannot work the queue — the
page rendered but reported "Could not load restricted cases. Check the API connection."

Three hypotheses died before the real one. It was not the synthetic session cookie: a
genuine email login failed identically. It was not the officer's permissions: the same
account got `200` from the endpoint directly. And it was not the error handling — I
suspected `error instanceof ApiRequestError` was checking the wrong class, and checking
showed `ApiRequestError` is an alias of `LoczApiError`, so the guard was correct all along.

Temporary instrumentation gave the answer in one line: `TypeError: fetch failed`. Node
resolves `localhost` to `::1` first, and the API listens on `0.0.0.0` — IPv4 only. Every
browser request succeeded; the server-to-server call from Next did not, intermittently.

**The admin gate had already caught it and I had not looked**: it dropped from 53/53 to
50/3, and the three failures were "dashboard shows live data", "users shows live data",
"audit log shows live data" — three unrelated pages losing their data at once, which is the
signature of a connection rather than a page. That distinction is now written into
`docs/TROUBLESHOOTING.md`, because the page-specific presentation invites a hunt through
the wrong code.

The local environment is pinned to `127.0.0.1`; `.env.example` keeps `localhost` and
explains when it bites. Afterwards the officer's workspace renders, and the pages they
should not reach say `Missing permission: listing:moderate` rather than a generic fallback
— which is what the error handling was doing correctly the whole time.

**241 unit tests. Admin 53, web 110, security 99.**

## M35 — The release gate did not consult the suites (2026-07-26)

The release gate ran typechecks, unit tests, production builds, the browser gate and the
preflight — and none of the seven HTTP suites. Roughly four hundred assertions, including
every security probe, the filter semantics, the background jobs and the index plans, took
no part in the decision to ship.

They are opt-in rather than default for a good reason: they need a live stack, and a build
machine may have no database. So `--stack` runs them, and without it the gate now records
the stage as **skipped** rather than passed:

```
PASS — 7/7 gates passed, 1 skipped
Not run: http acceptance suites
```

The previous summary said `8/8 gates passed` while one of them had never run. A report that
cannot distinguish "we checked and it was fine" from "we did not check" is the kind of
evidence that gets quoted in a post-mortem.

`npm run acceptance:all` runs all seven in the order where the first failure is the most
informative — the buyer and seller journey first, because if that is broken, knowing a
filter is also wrong tells you nothing you can act on.

**All seven pass together: 375 assertions in 216 seconds.**

## M36 — Two of the three languages were 36% (2026-07-26)

The brief asks for English, Telugu and Hindi. Nobody had ever measured the last two: both
sat at **96 of 269 keys**, and the shortfall was concentrated exactly where it hurts —
**auth 85% missing, post 64% missing**. Signing in and posting an advert are the two things
no user can avoid, so a Telugu speaker met English at both.

Nothing looked broken, which is why it survived this long. A missing key falls back to
English rather than rendering `nav.home`, and silent fallback is the right runtime
behaviour — it is also what makes this failure invisible without counting.

**Both locales are now complete: 269 of 269.** The only string identical to English is
`brand.name`, which is the product name.

`npm run check:i18n` runs in the release gate's default path, since it needs no live stack.
It asserts four things, and the last two are the ones a coverage percentage would miss:

- every key exists
- none is merely copied from English — present-but-identical counts as covered and reads as
  English on the page
- **every placeholder survives**, because a dropped `{city}` is worse than a missing
  translation: the interpolator leaves the literal text and the reader sees `{city}`
- no locale carries keys English does not have, which is how a key renamed in English
  quietly falls back for ever

Verified by rendering: `/signin` with a Telugu cookie returns Telugu throughout.

**Written by a careful non-native speaker and needing a native review before launch** — the
same caveat as the legal corpus in ADR-0013. Register was the thing I paid most attention
to: the respectful imperative in Telugu, the आप form in Hindi, and ordinary words rather
than transliterations where both languages have one (ఉచితం and मुफ़्त, not "free").

## M37 — The restore drill was checking eight of sixty-two tables (2026-07-26)

The schema has grown by roughly a dozen tables since the drill was written — safety cases,
blocked image hashes, suspensions, evidence access logs — and the drill compared row counts
for a **hand-picked list of eight**. Exactly the staleness trap already fixed once in
`verify-db.sh`, and here it left the newest and most sensitive records unchecked: a silent
loss in `media_safety_cases` or `blocked_image_hashes` would have passed 17/17.

Tables are now discovered from the schema. Which immediately exposed a flaw in the method
itself.

### Comparing a snapshot against a moving target

Eight tables "mismatched" on the first run, and one had _more_ rows restored than the live
database held. Nothing had been lost — the live database was being written to while the
drill ran, by the browser suites and by my own runs. A dump is a moment; the live database
keeps moving.

Counting before the dump as well as after tells the two apart. A table whose live count is
unchanged across the drill must match the restore **exactly** — anything else is data loss.
A table that moved cannot be compared, and is reported rather than passed or failed,
because either would be a guess:

```
~ system_settings              changed during the drill (8 → 9), restored 8
✓ 56 settled tables restored exactly
  1 table(s) were written to while the drill ran and could not be compared.
```

That branch was exercised deliberately by writing a row mid-drill rather than assumed —
the same reason the OTP-logging tests were checked by making the provider leak.

**16 checks, 0 failures**, 62 tables, 191 indexes, and the geo trigger still firing on a
fresh insert in the restored copy.

## M38 — The catalogue was complete; the pages were not (2026-07-26)

Screenshots of the Telugu post wizard showed translated headings above English
instructions. Both facts were true at once: `check:i18n` reported 269 of 269 keys in every
language, and the page was half English.

A string typed straight into a component never reaches the catalogue. It is not missing —
it does not exist as a key at all — so a coverage report cannot see it, and it stays English
in every language while the number reads 100%. My gate measured the dictionary and called it
the language.

`npm run check:hardcoded` reads the components instead: text between JSX tags, plus
`placeholder`, `title`, `aria-label` and `alt`, which are the easiest to forget because they
are attributes rather than content and only a screen reader or a tooltip ever surfaces them.

**448 strings across 37 files.** Concentrated where it matters most:

| File                             | Strings |
| -------------------------------- | ------- |
| `post/listing-type-fields.tsx`   | 81      |
| `business/new/business-form.tsx` | 37      |
| `b/[slug]/page.tsx`              | 29      |
| `dashboard/page.tsx`             | 27      |
| `search/search-filters.tsx`      | 25      |

The nine listing types each carry their own fields — "Like new", "For parts", "Walk-in
address and timings" — and every one of them is English for every user.

Precision was checked before the number was reported: of twenty sampled findings, nineteen
were genuine and one was a code fragment, which is now excluded. A list nobody trusts is a
list nobody acts on, so the aim was accuracy over completeness.

It is **not** wired into the release gate yet. Failing a release on 448 pre-existing strings
would only teach people to pass `--skip`, and the fix belongs with whoever is localising the
wizard. It is a script to run and a number to drive down.
