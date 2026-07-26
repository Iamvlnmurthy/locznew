# Local setup

## Prerequisites

| Tool           | Version              | Needed for                            |
| -------------- | -------------------- | ------------------------------------- |
| Node.js        | 22+ (24 recommended) | API, web, admin                       |
| npm            | 10+                  | workspaces                            |
| Docker Desktop | 4.30+                | PostgreSQL, Redis, Meilisearch, MinIO |
| Flutter        | 3.35+                | mobile only                           |

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

> **Running Postgres natively instead of in Docker?** See
> [Local PostgreSQL](#local-postgresql-without-docker) at the end of this document. The
> rest of the stack (Redis, Meilisearch, MinIO) still comes from Compose.

```bash
npm run docker:up
```

This brings up PostgreSQL 18 + PostGIS 3.6, Redis 8, Meilisearch v1.24, and MinIO with
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
npm run db:migrate    # applies all migrations
npm run db:seed       # roles, geography, categories, test accounts
```

Then load the postal codes — LocZ serves every pincode in India, and the pincode is how
most users state their location:

```bash
curl -o IN.zip https://download.geonames.org/export/zip/IN.zip && unzip IN.zip
npm run db:import-pincodes -w @locz/api -- ./IN.txt
```

That imports 19,238 codes (35 states and union territories) in about a minute. It is
idempotent — re-run it whenever GeoNames publishes an update. Skip it and pincode search
returns nothing; everything else still works.

The first migration creates the 52 application tables and enables PostGIS. The second adds what Prisma's
schema language cannot express: GiST spatial indexes, partial indexes for the background
sweepers, trigram indexes, the one-default-location constraint, and the triggers that
derive the `geo` column from latitude/longitude.

Rehearse the restore before you need it:

```bash
./scripts/restore-drill.sh          # backs up, restores to a scratch database, compares, drops it
```

A backup nobody has restored is a hypothesis. The drill checks what decides whether the
application still works afterwards — every table and row count, every index including the
hand-written spatial and partial ones, every trigger (the `geo` column is derived by one,
and losing it stops coordinates becoming points with no error anywhere), the extensions,
and finally a radius query on the restored copy to prove the structures are not merely
present but functional.

Then verify it. **Run this — it is the difference between "the migration succeeded" and
"the database actually works":**

```bash
./scripts/verify-db.sh
```

It checks the failures that are otherwise silent: PostGIS missing, a GiST index that was
never created, a `geo` column the trigger never populated, and coordinates entered the
wrong way round. A radius search hitting any of those returns _no results_ rather than an
error — which reads as "nothing near me" and can survive to production unnoticed.

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

| Role                         | Phone (OTP)   | Email (password)             |
| ---------------------------- | ------------- | ---------------------------- |
| Super administrator          | +919000000001 | super@locz.test              |
| Administrator                | +919000000002 | admin@locz.test              |
| Moderator                    | +919000000003 | moderator@locz.test          |
| Seller                       | +919000000004 | seller@locz.test             |
| Buyer                        | +919000000005 | buyer@locz.test              |
| Business owner / employer    | +919000000006 | business@locz.test           |
| Service provider             | +919000000007 | provider@locz.test           |
| Primary child-safety officer | +919000000008 | childsafety@locz.test        |
| Backup child-safety officer  | +919000000009 | childsafety.backup@locz.test |

Password for every account: `LocZ@dev1234`

- **Web** uses phone OTP. Enter the ten digits without `+91`; the code appears on screen.
- **Admin console** uses email and password — reachable without an SMS gateway.

## Seed data

- 10 roles with permission sets
- India → Telangana + Andhra Pradesh → 8 cities (5 launched) → 8 Hyderabad localities,
  each with Telugu and Hindi names
- 30 categories with dynamic attribute definitions (brand, condition, RAM, fuel type…)
- 15 banned keywords, expiry rules per listing type, 8 system settings

The seed is idempotent — every write is an upsert on a natural key, so re-running it
converges rather than duplicating.

## Useful commands

```bash
npm run typecheck                       # every workspace
npm run openapi -w @locz/api            # regenerate docs/openapi.json
./scripts/verify-db.sh                  # post-migration health check
./scripts/backup.sh                     # pg_dump -Fc, verified and rotated
./scripts/restore.sh <dump> --into locz_restore_test
npm run test -w @locz/api               # unit + DI tests
npm run db:studio -w @locz/api          # Prisma Studio
npm run docker:logs                     # tail infrastructure
npm run docker:down                     # stop (data survives)

docker compose -f infrastructure/docker/docker-compose.dev.yml down -v   # wipe data
```

## Mobile

See [MOBILE_SETUP.md](MOBILE_SETUP.md).

---

## Database operations

### Backups

```bash
./scripts/backup.sh                          # writes infrastructure/docker/backups/
BACKUP_S3_BUCKET=locz-backups ./scripts/backup.sh   # and ships it off-box
```

The script verifies each dump with `pg_restore --list` and refuses to rotate old backups
if the new one contains implausibly few tables — otherwise pointing it at the wrong
database would quietly age out every real backup. From cron on the database host:

```
0 2 * * * /srv/locz/scripts/backup.sh >> /var/log/locz-backup.log 2>&1
```

### Restore drills

```bash
./scripts/restore.sh backups/locz-20260726-020000.dump --into locz_restore_test
```

Do this monthly. It restores into a throwaway database and prints row counts plus a
spatial-integrity check. A backup nobody has restored is a guess. Restoring over the live
database is possible but requires typing the database name to confirm.

### Connection pooling

Prisma opens a pool per process, defaulting to `cpus * 2 + 1`. An API plus a worker plus
a couple of replicas will exhaust Postgres's default `max_connections` of 100, so
`DATABASE_URL` carries an explicit `connection_limit`. Keep
`connection_limit × instances` comfortably below `max_connections`.

Behind a transaction pooler (PgBouncer, Neon, Supabase) add `?pgbouncer=true` to
`DATABASE_URL` and set `DIRECT_DATABASE_URL` to the unpooled endpoint — DDL cannot run
through a transaction pooler, so migrations use the direct connection while application
traffic keeps the pool.

---

## Local PostgreSQL without Docker

The project is developed against a natively installed PostgreSQL 18.4 with PostGIS 3.6.2.
No administrator rights are needed — these are the portable binaries, which live entirely
in a user directory and are removed by deleting it.

```powershell
# PostgreSQL binaries (no installer, no service, no admin)
Invoke-WebRequest `
  -Uri "https://get.enterprisedb.com/postgresql/postgresql-18.4-1-windows-x64-binaries.zip" `
  -OutFile "$HOME\locz-pg\downloads\pg.zip"
Expand-Archive "$HOME\locz-pg\downloads\pg.zip" -DestinationPath "$HOME\locz-pg"

# PostGIS bundle, extracted over the PostgreSQL tree
Invoke-WebRequest `
  -Uri "https://download.osgeo.org/postgis/windows/pg18/postgis-bundle-pg18-3.6.2x64.zip" `
  -OutFile "$HOME\locz-pg\downloads\postgis.zip"
```

Initialise with ICU collation — the libc provider on Windows does not order Telugu or
Devanagari correctly:

```powershell
& "$HOME\locz-pg\pgsqlin\initdb.exe" --pgdata="$HOME\locz-pg\data" `
  --username=postgres --pwfile=<file> --encoding=UTF8 `
  --locale-provider=icu --icu-locale=en-IN
```

Start and stop it with `pg_ctl`:

```powershell
& "$HOME\locz-pg\pgsqlin\pg_ctl.exe" -D "$HOME\locz-pg\data" -l "$HOME\locz-pg\logs\postgresql.log" start
& "$HOME\locz-pg\pgsqlin\pg_ctl.exe" -D "$HOME\locz-pg\data" stop
```

Then create the role, the databases and the extensions:

```sql
CREATE ROLE locz WITH LOGIN PASSWORD '...' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE locz WITH OWNER = locz ENCODING = 'UTF8'
  LOCALE_PROVIDER = 'icu' ICU_LOCALE = 'en-IN' TEMPLATE = template0;
CREATE DATABASE locz_test WITH OWNER = locz ENCODING = 'UTF8'
  LOCALE_PROVIDER = 'icu' ICU_LOCALE = 'en-IN' TEMPLATE = template0;

-- In each database, as superuser:
CREATE EXTENSION postgis; CREATE EXTENSION pg_trgm; CREATE EXTENSION unaccent;
CREATE EXTENSION citext;  CREATE EXTENSION "uuid-ossp"; CREATE EXTENSION pg_stat_statements;
ALTER SCHEMA public OWNER TO locz;
```

The application role is deliberately `NOSUPERUSER NOCREATEDB` — it needs DML and DDL
inside its own database and nothing beyond it.
