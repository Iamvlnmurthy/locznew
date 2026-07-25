# LocZ

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

| Document                                           | Contents                                                   |
| -------------------------------------------------- | ---------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)       | System map, modules, data shape, security model            |
| [docs/SETUP.md](docs/SETUP.md)                     | Local setup, test accounts, commands                       |
| [docs/MOBILE_SETUP.md](docs/MOBILE_SETUP.md)       | Flutter setup, permissions, Firebase, release builds       |
| [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)           | The end-to-end Phase 1 acceptance run                      |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Symptom → cause → fix                                      |
| [DECISIONS.md](DECISIONS.md)                       | Architecture decision log (ADR-0001…0009)                  |
| [PROGRESS.md](PROGRESS.md)                         | Per-milestone status, and what is verified versus authored |

## What Phase 1 delivers

Mobile-OTP authentication with rotating refresh tokens · role-based access with nine
roles · PostGIS location system with radius search from 1–50 km · a unified listing
engine with per-type extensions and admin-defined dynamic attributes · direct-to-storage
media with EXIF stripping and WebP renditions · rules-based moderation with a review
queue · Meilisearch indexing with a database fallback · a location-aware home feed ·
enquiry threads · notifications · an operations console · trilingual UI (English, Telugu,
Hindi) · SEO-ready public pages with structured data.

## Verification status

Read [PROGRESS.md](PROGRESS.md) before trusting any part of this. In summary:

- ✅ **Verified here:** API typechecks and builds (`dist/main.js` + `dist/worker.js`),
  9 tests pass, web and admin both `next build` clean, the Prisma schema validates, the
  Dart token generator runs.
- 🟡 **Authored, not executed:** everything requiring Docker (migrations, seeds, every
  database query) and everything requiring the Flutter SDK (the whole mobile app).

The workstation this was built on has Node and npm but no Docker and no Flutter. Nothing
has been marked done on the strength of looking right.

## Contributing rules

Migrations for every schema change · business logic stays in the API · no duplicate
models between web and mobile · no secrets in frontend bundles · run typecheck and tests
after meaningful changes · keep `PROGRESS.md` and `DECISIONS.md` current.
