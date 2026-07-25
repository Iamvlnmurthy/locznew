# Local setup

## Prerequisites

| Tool           | Version                 | Needed for                            |
| -------------- | ----------------------- | ------------------------------------- |
| Node.js        | 20.11+ (22 recommended) | API, web, admin                       |
| npm            | 10+                     | workspaces                            |
| Docker Desktop | 4.30+                   | PostgreSQL, Redis, Meilisearch, MinIO |
| Flutter        | 3.24+                   | mobile only                           |

Check with `node -v && npm -v && docker -v`.

---

## 1. Environment

```bash
cp .env.example .env
```

Then generate the two JWT secrets — the API refuses to boot with the placeholder values:

```bash
# macOS / Linux
openssl rand -base64 48   # paste into JWT_ACCESS_SECRET
openssl rand -base64 48   # paste into JWT_REFRESH_SECRET

# Windows PowerShell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
```

Everything else in `.env.example` has a working local default. Leave `OTP_PROVIDER=mock`:
the verification code is returned in the API response and printed to the log, so no SMS
gateway is needed. (Setting `NODE_ENV=production` with the mock provider aborts startup.)

## 2. Install

```bash
npm install
```

npm 11 blocks package install scripts by default. Prisma, argon2 and sharp need theirs,
and they are already allow-listed in the root `package.json`. If a fresh clone reports
missing native binaries:

```bash
npm approve-scripts prisma @prisma/client @prisma/engines argon2 sharp msgpackr-extract
npm rebuild argon2 sharp
```

## 3. Start the infrastructure

```bash
npm run docker:up
```

This brings up PostgreSQL 16 + PostGIS 3.4, Redis 7, Meilisearch v1.11, and MinIO with
the media bucket created. Wait for health:

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml ps
```

| Service       | URL                   | Credentials                                           |
| ------------- | --------------------- | ----------------------------------------------------- |
| PostgreSQL    | `localhost:5432`      | from `.env`                                           |
| Redis         | `localhost:6379`      | —                                                     |
| Meilisearch   | http://localhost:7700 | `MEILI_MASTER_KEY`                                    |
| MinIO console | http://localhost:9001 | `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` |

## 4. Database

```bash
npm run db:migrate    # applies both migrations
npm run db:seed       # roles, geography, categories, test accounts
```

The first migration creates 45 tables and enables PostGIS. The second adds what Prisma's
schema language cannot express: GiST spatial indexes, partial indexes for the background
sweepers, trigram indexes, the one-default-location constraint, and the triggers that
derive the `geo` column from latitude/longitude.

Verify PostGIS is actually working — this is the single most common setup failure:

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml exec postgres \
  psql -U locz -d locz -c "SELECT PostGIS_Version();"

docker compose -f infrastructure/docker/docker-compose.dev.yml exec postgres \
  psql -U locz -d locz -c "\d listings" | grep gist
```

## 5. Run

Three terminals:

```bash
npm run dev:api      # http://localhost:4000  · Swagger at /api/docs
npm run dev:web      # http://localhost:3000
npm run dev:admin    # http://localhost:3001
```

The background worker is a separate process in production. Locally the API hosts the
same processors, so search indexing and expiry work without starting it. To run it
separately:

```bash
npm run build -w @locz/api && node apps/api/dist/worker.js
```

---

## Test accounts

Created by the seed. **Development only** — the seed skips them when `NODE_ENV=production`.

| Role                      | Phone (OTP)   | Email (password)    |
| ------------------------- | ------------- | ------------------- |
| Super administrator       | +919000000001 | super@locz.test     |
| Administrator             | +919000000002 | admin@locz.test     |
| Moderator                 | +919000000003 | moderator@locz.test |
| Seller                    | +919000000004 | seller@locz.test    |
| Buyer                     | +919000000005 | buyer@locz.test     |
| Business owner / employer | +919000000006 | business@locz.test  |
| Service provider          | +919000000007 | provider@locz.test  |

Password for every account: `LocZ@dev1234`

- **Web** uses phone OTP. Enter the ten digits without `+91`; the code appears on screen.
- **Admin console** uses email and password — reachable without an SMS gateway.

## Seed data

- 9 roles with permission sets
- India → Telangana + Andhra Pradesh → 8 cities (5 launched) → 8 Hyderabad localities,
  each with Telugu and Hindi names
- 30 categories with dynamic attribute definitions (brand, condition, RAM, fuel type…)
- 15 banned keywords, expiry rules per listing type, 8 system settings

The seed is idempotent — every write is an upsert on a natural key, so re-running it
converges rather than duplicating.

## Useful commands

```bash
npm run typecheck                       # every workspace
npm run test -w @locz/api               # unit + DI tests
npm run db:studio -w @locz/api          # Prisma Studio
npm run docker:logs                     # tail infrastructure
npm run docker:down                     # stop (data survives)

docker compose -f infrastructure/docker/docker-compose.dev.yml down -v   # wipe data
```

## Mobile

See [MOBILE_SETUP.md](MOBILE_SETUP.md).
