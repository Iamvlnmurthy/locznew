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
