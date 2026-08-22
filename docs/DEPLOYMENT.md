# Production deployment

There are two different setups described in this file, and confusing them has already cost
time during an incident. Read this section before doing anything else.

- **[Part A — how production runs today](#part-a--how-production-runs-today).** The
  application processes run under **pm2** as the OS user `locz` from `/home/locz/app`,
  built directly from a Git checkout. Only the datastores run in Docker, as **standalone
  containers**. There is no Nginx container, no API container, no Compose stack in play.
  If you are on-call, this is the part you want.
- **[Part B — the Docker Compose stack](#part-b--the-docker-compose-stack).** The
  self-contained Compose deployment in `infrastructure/docker/docker-compose.prod.yml`.
  It is not what `locz.in` runs on. It is kept for a from-scratch install on a fresh host,
  and it has drifted from production — see the caveats there before trusting it.

Anything you read in Part B (`docker compose ... restart api`, `infrastructure/docker/.env`,
certbot inside the stack) does not apply to the live host.

---

# Part A — how production runs today

## Topology

Application processes, under pm2, owned by the `locz` user, working directory
`/home/locz/app`:

| pm2 process   | What it is            | Notes                                                                        |
| ------------- | --------------------- | ---------------------------------------------------------------------------- |
| `locz-api`    | NestJS API            | script `/home/locz/app/apps/api/dist/main.js`, cwd `/home/locz/app/apps/api` |
| `locz-web`    | Next.js public site   | Next 16.2.12                                                                 |
| `locz-admin`  | Next.js admin console |                                                                              |
| `locz-worker` | Background job worker | built from `apps/api/src/worker.ts`                                          |

Datastores, as standalone `docker run` containers (**not** `docker compose`):

| Container          | Image                        |
| ------------------ | ---------------------------- |
| `locz-postgres`    | `postgis/postgis:18-3.6`     |
| `locz-meilisearch` | `getmeili/meilisearch:v1.24` |
| `locz-minio`       | `minio/minio`                |

### The pm2 trap: there are two pm2 instances on this host

pm2 is per-user. There is a **separate pm2 instance owned by `root`** running unrelated
applications. A bare `pm2 list` as root shows those and **not** LocZ, which looks exactly
like "the app is gone". Every LocZ pm2 command must go through the `locz` user:

```bash
su - locz -c 'pm2 list'
```

If a command does not start with `su - locz -c`, you are looking at the wrong pm2.

### Shared host

The host has 4 CPUs and roughly 15 GB of RAM, **shared with many unrelated applications**.
That constrains deployment more than anything else: `next build` is the CPU-heavy step and
will starve everything else on the box while it runs. Do not run a build while heavy
database work (migration, reindex, bulk import) is in progress — either can then be slow
enough to look like an outage.

## Deploying an update

All of this runs as the `locz` user in `/home/locz/app`:

```bash
su - locz
cd /home/locz/app
git pull
npm install
npx prisma generate
npm run build
```

`npm run build` fans out over the workspaces: `apps/api` runs `nest build`, `apps/web` and
`apps/admin` run `next build`. Then restart:

```bash
pm2 restart locz-api locz-worker locz-web locz-admin
```

Two things to know about that sequence:

- **`npx prisma generate` is not optional after a schema change.** The generated client
  lives in `node_modules`; a stale one gives type errors at build time, or worse, a build
  that succeeds and a runtime that queries columns that no longer exist.
- **Build before restart, not after.** The processes serve from `dist/` and `.next/`.
  Restarting first just reboots the old code and adds downtime for nothing.

Database migrations are a separate, deliberate step — they are not part of `npm run build`
and are not run automatically on this host. Take a database backup before any release that
migrates.

### Restarting under pm2

Where an `ecosystem.config.cjs` exists on the server, restart from it rather than with a
bare `pm2 restart <name> --update-env`:

```bash
su - locz -c 'cd /home/locz/app && pm2 startOrRestart ecosystem.config.cjs --only locz-web'
```

`--update-env` on its own replaces the process environment with the environment of the
shell issuing the command. Run from a login shell, that discards everything the app was
started with and the process comes back up configured differently from how it was
deployed — while reporting `online`. A plain `pm2 restart <name>` without `--update-env`
keeps the saved environment and is safe.

> Open question: `ecosystem.config.cjs` is **not** committed to this repository, so it
> exists only on the server, if at all. Whoever next touches the host should confirm
> whether `/home/locz/app/ecosystem.config.cjs` exists and, if so, commit it — an
> uncommitted process definition is a single-disk copy of how production is configured.

> Open question: the environment variables and env-file paths used by the pm2 processes
> are not recorded here, because they were not verified. The API's expected variables are
> declared in `apps/api/src/config/configuration.ts`, but where those values come from on
> the server (a `.env` in `/home/locz/app`, a pm2 `env:` block, or the shell profile) is
> unconfirmed.

## Checking status and logs

```bash
su - locz -c 'pm2 list'                  # all four online, with a low restart count
su - locz -c 'pm2 logs locz-api --lines 200'
su - locz -c 'pm2 describe locz-api'     # script path, cwd, uptime, restart count
docker ps                                # locz-postgres, locz-meilisearch, locz-minio
docker logs --tail 200 locz-postgres
```

A climbing restart count on a process that reports `online` is the signal to look for: pm2
restarts a crashing process fast enough that a single snapshot of `pm2 list` looks healthy.

API probes:

```bash
curl --fail https://locz.in/api/v1/health/live
curl --fail https://locz.in/api/v1/health/ready
```

`live` says the process is up; `ready` says its dependencies answer. Neither says a buyer
can complete a journey — for that, run the smoke gate below.

## Rolling back

The unit of rollback is the Git commit, because the deployed artefacts are built on the
host rather than pulled as images. Record the commit SHA of every release; without it,
rollback starts with archaeology.

```bash
su - locz
cd /home/locz/app
git log --oneline -5          # find the last known-good SHA
git checkout <sha>
npm install
npx prisma generate
npm run build
pm2 restart locz-api locz-worker locz-web locz-admin
```

Keep the migrated schema. Migrations must be backward-compatible with the previous release
for exactly this reason — never restore an old database merely to match old code unless a
separately tested disaster-recovery procedure requires it.

Budget for the rebuild: rollback is not instant here, because `next build` has to run again
on a shared 4-CPU box. If traffic must stop hitting broken code immediately and you cannot
wait for a build, stopping the affected process is the faster lever.

## Known issue: `locz-postgres` has a 64 MB `/dev/shm`

**Symptom.** Intermittent HTTP 500s on `/api/v1/businesses/nearby`, with this in the API or
Postgres logs:

```
ERROR 53100: could not resize shared memory segment ... No space left on device
```

**Cause.** The `locz-postgres` container was created with Docker's default shared-memory
size of 64 MB (`ShmSize: 67108864`). PostgreSQL parallel-query workers allocate their
shared memory segments in `/dev/shm`. When a plan needs more than 64 MB the allocation
fails and the query errors out. It is intermittent because it depends on the plan the
planner chooses, which depends on the parameters of the request — the same endpoint
succeeds for most callers and fails for some.

Confirm it before changing anything:

```bash
docker inspect locz-postgres --format '{{.HostConfig.ShmSize}}'   # 67108864 = the bad value
```

**Fix.** `ShmSize` cannot be changed on a running container. The container has to be
removed and recreated with a larger value, which means a **PostgreSQL restart** — schedule
it rather than doing it under load.

```bash
docker inspect locz-postgres > /root/locz-postgres-inspect.json   # capture first
docker rm -f locz-postgres
docker run -d --name locz-postgres --restart unless-stopped \
  --shm-size=1g \
  ...same ports, volumes and environment as the captured config... \
  postgis/postgis:18-3.6
docker inspect locz-postgres --format '{{.HostConfig.ShmSize}}'   # 1073741824
```

Reuse the captured configuration exactly. The data lives in a volume, so removing the
container does not remove the database — **but only if you mount the same volume back**.
Verify the volume mount in the inspect output before you run `docker rm`.

Do not treat "the 500s stopped" as proof on its own; re-check that `ShmSize` reads
`1073741824`.

## Meilisearch

Run a server version that matches the `meilisearch` client in `package.json`. The client is
currently 0.60.x, so the server must be a recent 1.2x — production runs
`getmeili/meilisearch:v1.24`.

```bash
docker run -d --name locz-meilisearch --restart unless-stopped \
  -p 127.0.0.1:7700:7700 -v locz-meilidata:/meili_data \
  --env-file <file with MEILI_MASTER_KEY, MEILI_ENV=production> \
  --memory=512m getmeili/meilisearch:v1.24
```

The version match is not cosmetic. Running the 0.60 client against a 1.11 server produced the
worst kind of failure: `swapIndexes` created no task at all, yet the call reported success, so
a rebuild indexed every listing into a replacement index, "swapped" nothing, then deleted the
replacement — leaving the live index empty while the API happily reported `usedSearchIndex:
true` and returned no results for every keyword. Search was worse with the index running than
without it.

Bind to `127.0.0.1` only. Nothing outside the host has any business reaching it, and the
master key is the only thing standing between a caller and the whole catalogue.

Pass the key through `--env-file`, never `-e`: an `-e` argument is visible in `docker inspect`
and in the process list to every user on the host, and this is a shared machine.

After starting it, rebuild and confirm the drift is zero:

```bash
curl -X POST -H "Authorization: Bearer <admin token>" https://api.locz.in/api/v1/search/index/rebuild
curl -H "Authorization: Bearer <admin token>" https://api.locz.in/api/v1/search/index/status
# {"available":true,"indexedDocuments":9,"publishedListings":9,"drift":0}
```

A non-zero drift after a rebuild means the swap did not happen. Do not leave it running in
that state — the fallback to PostgreSQL is strictly better than an index that answers
confidently with nothing.

## Post-release checks

Run the deployed smoke gate, which drives a real browser against the live origin:

```bash
LOCZ_WEB=https://locz.in node scripts/acceptance-deployed.mjs
```

It exists because every other browser gate drives a locally started Next server and so
never crosses the reverse proxy. Two outages have hidden in exactly that gap, both of
them invisible to a health check and to the pre-release suites:

- **A duplicated `Origin` header.** OpenLiteSpeed sends it twice, Node joins repeats with
  `", "`, and Next parses the result as a URL when validating a Server Action — so it
  threw before any of its own checks ran. Page loads were unaffected, so the site looked
  healthy while no Server Action worked at all. Repaired in `apps/web/src/middleware.ts`.
- **A build that could not see the root `.env`.** `NEXT_PUBLIC_*` is inlined at build
  time, so the bundle shipped the `localhost` defaults and every API-backed lookup came
  back empty — the location picker called real pincodes typos. The Next configs now load
  the root `.env` themselves.

The second one is a permanent hazard of this setup in particular: because the web app is
built on the host, a wrong or missing `.env` at build time bakes bad values into the
bundle, and no restart will clear it. Only another build will.

There is also a fuller production smoke:

```bash
LOCZ_SMOKE_ADMIN_EMAIL=release-check@locz.in \
LOCZ_SMOKE_ADMIN_PASSWORD='read-from-your-secret-manager' \
npm run smoke:production
```

It checks TLS headers, API liveness/readiness, Meilisearch usage and drift, the admin
host's anti-indexing/frame headers, hidden production API docs, and logout cleanup. Set
`LOCZ_SMOKE_MAX_INDEX_DRIFT` only when a documented release permits temporary drift.
`LOCZ_API_URL` may override the default `${LOCZ_PRODUCTION_URL}/api/v1` when the API uses
a separate origin.

After deployment, also check the reverse-proxy and API error logs, queue failures, Sentry,
SMS delivery and push delivery.

> Open question: TLS termination and the reverse proxy in front of pm2 are not documented
> here. The `Origin`-header incident above implicates **OpenLiteSpeed**, not the Nginx
> container from Part B, but the live proxy's configuration, its config path and its
> certificate renewal mechanism were not verified and are not in this repository.

---

# Part B — the Docker Compose stack

`infrastructure/docker/docker-compose.prod.yml` describes a complete self-contained
deployment: Nginx, a one-shot migrate job, API, worker, web, admin, PostGIS, Redis and
Meilisearch, plus a certbot maintenance profile for TLS.

**This is not what production runs.** Nothing in this part applies to the live host. It is
kept because it is still the fastest way to stand up a full LocZ deployment on a fresh
machine, and because the Dockerfiles and Nginx configuration are the reference for how the
pieces are meant to fit together.

Known divergences from production — do not assume parity:

- Production runs the applications under pm2, not as containers. Only Postgres,
  Meilisearch and MinIO are containerised there.
- This stack runs **Redis** as a container. Production does not: Redis there is a host
  systemd service listening on `127.0.0.1:6379` (`systemctl status redis`), which is why it
  does not appear in `docker ps`. Queue-backed features do work in production. Because it is
  bound to loopback rather than published by Docker, it is reachable by the pm2 processes on
  the host and by nothing else — check `ss -lntp | grep 6379` before concluding it is down.
- Production uses **MinIO** for object storage; this stack assumes external
  R2-compatible storage.
- Production TLS is not handled by this stack's Nginx or certbot.

If you bring this stack up on a fresh host, treat the result as a new deployment and
reconcile it against Part A before pointing production DNS at it.

## 1. Host and DNS

Provision a Linux host with Docker Engine and the Compose plugin. Point `locz.in`,
`www.locz.in` and `admin.locz.in` to it before requesting TLS certificates. Keep ports
80 and 443 open; do not expose PostgreSQL, Redis or Meilisearch.

## 2. Environment

Compose reads `infrastructure/docker/.env`, not the repository-root `.env`:

```bash
cp .env.example infrastructure/docker/.env
chmod 600 infrastructure/docker/.env
```

Replace every development value. Use different random values of at least 32 characters
for both JWT secrets, a non-mock SMS provider, object-storage credentials and a strong
Meilisearch key. Public Next.js values are embedded during image build and must use the
final HTTPS URLs.

Run the preflight before building:

```bash
npm run preflight:production -- --dns
```

It prints variable names and results only — never secret values.

## 3. First TLS certificate

The main Nginx configuration requires a certificate at startup. Bootstrap HTTP first:

```bash
docker run --rm -d --name locz-acme-bootstrap \
  -p 80:80 \
  -v "$PWD/infrastructure/nginx/acme-bootstrap.conf:/etc/nginx/nginx.conf:ro" \
  -v "$PWD/infrastructure/docker/certbot/www:/var/www/certbot" \
  nginx:1.29-alpine

docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --profile maintenance run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d locz.in -d www.locz.in -d admin.locz.in \
  --email YOUR_OPERATIONS_EMAIL --agree-tos --no-eff-email

docker stop locz-acme-bootstrap
```

Rerun the preflight; both certificate checks must pass.

## 4. Build, migrate and start

Back up the database first. Then build the exact source state and let the one-shot
migration service finish before API traffic starts:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml build --pull
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d
docker compose -f infrastructure/docker/docker-compose.prod.yml ps
```

Then verify with the health probes and smoke gates in
[Post-release checks](#post-release-checks).

## 5. Certificate renewal

Run this from a systemd timer or cron at least daily:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --profile maintenance run --rm certbot renew --webroot -w /var/www/certbot
docker compose -f infrastructure/docker/docker-compose.prod.yml exec nginx nginx -s reload
```

Certbot exits successfully when no certificate is due; reloading Nginx is safe.

## 6. Rollback

With this stack the unit of rollback is the image set, not the Git checkout: record the Git
commit and the image digests for every release, and to roll back, deploy the previous image
set while keeping the migrated schema.
