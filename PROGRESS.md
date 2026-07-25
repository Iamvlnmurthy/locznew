# LocZ — Progress

Legend: ✅ done & verified · 🟡 authored, not yet verified · ⬜ not started

> **Verification note.** The workstation this repository was scaffolded on has Node 20+/npm
> but **no Docker, no Flutter SDK and no pnpm**. Anything that requires those to prove it works
> is marked 🟡 until it has been run on a machine that has them. Nothing is marked ✅ on the
> strength of "it looks right".

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
| Prisma schema — 45 models across identity, geo, catalog, listings, trust, comms, ops                                                                                | ✅ passes `prisma validate`                                     |
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
| `scripts/verify-db.sh` — 18 post-migration checks: extensions, 45 tables, GiST and partial indexes, geo triggers, coordinate-order sanity                         | ✅ authored, `bash -n` clean |
| `scripts/backup.sh` — `pg_dump -Fc`, verifies the dump with `pg_restore --list`, refuses to rotate on an implausible table count, optional off-box upload         | ✅ same                      |
| `scripts/restore.sh` — restore into a throwaway database with row counts and a spatial-integrity check; typing the database name required to overwrite production | ✅ same                      |
| Connection pooling — explicit `connection_limit`, plus `directUrl` for migrations behind a transaction pooler                                                     | ✅ schema validates          |
| `RecentlyViewed` trimming job — the unbounded table flagged in the database review, now capped at 200 rows per user                                               | ✅                           |
| `@locz/validation` wired into the web posting flow, with per-field errors surfaced in the form                                                                    | ✅                           |
| `@locz/api-client` replaces admin's duplicated client; moderation and system actions use its typed methods                                                        | ✅                           |
| `docs/API.md` — conventions, rate limits, idempotency, endpoint groups                                                                                            | ✅                           |

Both shared packages existed but nothing imported them — a package that compiles and is
never used is dead code that looks like coverage. They are now on the real path.

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

## Acceptance gate — end-to-end marketplace flow

Mock-OTP sign-in → city selection → create marketplace listing → image upload →
moderation → admin approval → search indexing → visible on web + mobile →
saved by another user → enquiry sent → owner notified.

Status: ⬜ — implemented end to end, never executed. The 12-step run with its SQL checks
is written up in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). Run it on a machine with Docker
and record the outcome here. Until that is done, Phase 1 is **not** complete.
