# LocZ

### Find it here.. Deal it near..

Location-first local discovery for India — free classifieds, marketplace listings, local
offers, jobs, services, rentals, events, business profiles and buyer requirements, on web,
Android and iOS.

**Posting is free.** Featured, sponsored, verified and subscription structures exist in
the data model, but no payment path is active in Phase 1.

## Stack

| Layer          | Technology                                                   |
| -------------- | ------------------------------------------------------------ |
| Web + Admin    | Next.js 15 (App Router), TypeScript                          |
| Mobile         | Flutter + Riverpod, one codebase for Android and iOS         |
| API            | NestJS modular monolith, REST `/api/v1`                      |
| Database       | PostgreSQL 16 + PostGIS 3.4, Prisma                          |
| Cache / queues | Redis 7, BullMQ                                              |
| Search         | Meilisearch (derived index; Postgres is the source of truth) |
| Storage        | Cloudflare R2 / S3-compatible (MinIO locally)                |
| Push           | Firebase Cloud Messaging                                     |
| Ops            | Docker Compose, Nginx, Sentry-compatible errors              |

## Layout

```
apps/api        NestJS API + BullMQ workers + Prisma schema
apps/web        public site, posting flow, user dashboard
apps/admin      moderation and operations console
apps/mobile     Flutter application
packages/       shared-types · validation · ui-tokens · config
infrastructure/ docker · nginx · database
docs/           architecture, setup, mobile setup, acceptance, troubleshooting
docs/openapi.json  committed API contract — 80 paths (npm run openapi -w @locz/api)
```

## Quick start

```bash
cp .env.example .env          # then generate the two JWT secrets
npm install
npm run docker:up             # postgis, redis, meilisearch, minio
npm run db:migrate
npm run db:seed
npm run dev:api               # :4000 · Swagger at /api/docs
npm run dev:web               # :3000
npm run dev:admin             # :3001
```

Development uses `OTP_PROVIDER=mock`: the verification code is returned in the response
and shown on screen, so no SMS gateway is needed. Production credentials come from
environment variables only — nothing is hardcoded or committed.

Full instructions, test accounts and seed contents: **[docs/SETUP.md](docs/SETUP.md)**.

## Documentation

| Document                                                                                   | Contents                                                   |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                               | System map, modules, data shape, security model            |
| [docs/SETUP.md](docs/SETUP.md)                                                             | Local setup, test accounts, commands                       |
| [docs/MOBILE_SETUP.md](docs/MOBILE_SETUP.md)                                               | Flutter setup, permissions, Firebase, release builds       |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                                                   | Production preflight, TLS bootstrap, deploy and rollback   |
| [docs/LAUNCH_RUNBOOK.md](docs/LAUNCH_RUNBOOK.md)                                           | Go/no-go gates, ownership, rehearsal and launch sign-off   |
| [docs/CHILD_SAFETY_OPERATIONS.md](docs/CHILD_SAFETY_OPERATIONS.md)                         | Restricted-case operations, approvals and readiness        |
| [docs/PROTECTED_HASH_PROVIDER_APPLICATION.md](docs/PROTECTED_HASH_PROVIDER_APPLICATION.md) | Provider application facts, questions and benign test gate |
| [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)                                                   | The end-to-end Phase 1 acceptance run                      |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)                                         | Symptom → cause → fix                                      |
| [DECISIONS.md](DECISIONS.md)                                                               | Architecture decision log (ADR-0001…0009)                  |
| [PROGRESS.md](PROGRESS.md)                                                                 | Per-milestone status, and what is verified versus authored |

## What Phase 1 delivers

Mobile-OTP authentication with rotating refresh tokens · role-based access with ten
roles · PostGIS location system with radius search from 1–50 km · a unified listing
engine with per-type extensions and admin-defined dynamic attributes · direct-to-storage
media with EXIF stripping and WebP renditions · rules-based moderation with a review
queue · Meilisearch indexing with a database fallback · a location-aware home feed ·
enquiry threads · notifications · an operations console · trilingual UI (English, Telugu,
Hindi) · SEO-ready public pages with structured data.

## Verification status

Read [PROGRESS.md](PROGRESS.md) before trusting any part of this. In summary:

- ✅ **Verified here:** all workspaces typecheck; **89 API tests** pass; the six core
  acceptance gates cover 337 assertions, with a separate 51-assertion attacker gate;
  API, web and admin production builds are clean. Flutter reports zero analyzer issues,
  passes 4 unit tests and an authenticated Android integration journey, builds an APK,
  and runs against the live local API on Android 16.
- 🟡 **Authored, not executed:** production Docker image/Compose rehearsal, real SMS and
  push delivery, signed store builds, physical-device coverage and iOS compilation.

Docker remains unavailable on this workstation. `npm run preflight:production` records
that limitation along with missing production credentials and TLS instead of allowing a
partially configured release.

## Contributing rules

Migrations for every schema change · business logic stays in the API · no duplicate
models between web and mobile · no secrets in frontend bundles · run typecheck and tests
after meaningful changes · keep `PROGRESS.md` and `DECISIONS.md` current.
