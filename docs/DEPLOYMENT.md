# LocZ deployment — the current process (read this before deploying)

This captures what changed after the Aug 2026 outage, so any machine or session can deploy safely.
The short version: **prefer CI; if you must deploy by hand, use the hardened scripts — never a bare
`npm install && next build` on the prod box.**

## The box (context)

- Prod VPS: `root@76.13.242.93` (= `mail.obliquemedia.in`), reached locally as `ssh onrol`. 15 GB RAM.
- **Multi-tenant** — it also hosts unrelated stacks: a Supabase (used by _other_ onrol.in sites, not
  LocZ — owner manages it), `n8n`, `dograh`, and `wos-grafana/prometheus`. It runs near-full, so
  memory discipline matters.
- App lives at `/home/locz/app`, run by pm2 as user `locz`: `locz-api` (:4200), `locz-web`,
  `locz-admin`, `locz-worker`, `locz-jobq`. DB is `locz-postgres` (Docker) on `127.0.0.1:5433`.
- On-demand stacks: `svc start|stop|status n8n|dograh|all` (kept off to save ~500 MB; see
  `scripts/svc.sh`).

## Two crash causes this process exists to prevent

1. **`argon2` native core-dump.** `npm install` can refetch argon2's prebuilt binary, which segfaults
   on this box and sends `locz-api` into a silent crash-loop (no error log, core dump on boot, dies
   at ~47 MB before Prisma loads). **Fix / prevention:** `npm rebuild argon2 --build-from-source`
   after every install. Diagnose with `strace -f -e trace=openat node dist/main.js` → the last file
   before `SIGSEGV` is `argon2.glibc.node`. (Prisma is NOT the culprit — it throws cleanly.)
2. **Build-OOM.** `next build` / `nest build` on the box spikes ~1–2 GB; on the full box that trips
   the OOM-killer, which killed Postgres mid-deploy. **Fix / prevention:** build off-box (CI), or in
   the scripts: `NODE_OPTIONS=--max-old-space-size=1536`, `nice/ionice`, and pause `locz-admin`
   during the build.

## Preferred path — CI/CD (off-box build)

`.github/workflows/deploy.yml` runs on every push to `master`: builds web+api on a GitHub Linux
runner, rsyncs the prebuilt `.next` + `apps/api/dist` to the VPS, then on the box does
`npm install` + `npm rebuild argon2 --build-from-source` + `db:generate` + `pm2 restart` + a 200
health check. The prod box never compiles. Setup + secrets: `docs/CI_DEPLOY_SETUP.md`
(`VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`, already configured with a dedicated deploy key).

## Fallback path — manual scripts (run as `sudo -u locz bash scripts/<x>.sh` on the VPS)

- **Web:** `scripts/deploy-web.sh` — git reset → npm install → **argon2 rebuild** → build (mem-capped,
  admin paused via trap) → restart `locz-web` → 200 check → restores previous `.next` on failure.
  Note: it `git reset`s to `origin/master` _inside_ the script, so the first run after editing the
  script itself still uses the old copy; the hardened version applies from the next run on.
- **API:** `scripts/deploy-api.sh` — git reset → npm install → **argon2 rebuild** → `db:generate` →
  build (mem-capped) → **boot-check on a throwaway port** → only then `pm2 restart locz-api`. Refuses
  to swap in a build that core-dumps.

Both need commits on `origin/master` first (they `git reset --hard` to it).

## Prisma

`@prisma/client` is v7 (needs a driver adapter — a bare `new PrismaClient()` throws by design).
After pulling schema changes: `npm run db:generate -w @locz/api`, or the api build reports phantom
"does not exist on PrismaService" errors. The deploy scripts already run generate.

## Tests / pushing

- `git push` runs a husky **pre-push** hook: `npm run typecheck` + `npm run test -w @locz/api`.
- The password specs use argon2; with production cost params they go flaky under Jest's parallel
  workers on slower machines (pass in isolation, time out under load). `apps/api/test/setup-env.ts`
  sets **low argon2 cost for the test env only** (`ARGON2_MEMORY_COST=512`, `TIME_COST=1`) — prod
  keeps the real defaults (19456 / 2). If auth specs flake, that's the knob.
- A news-engine burst (`C:\locz-news`, on the dev machine) uses ~18 GB + CPU; running the suite
  during a burst can also starve these tests. Push when no burst is active.

## Monitoring / recovery

- `scripts/vps-watchdog.sh` → `/home/locz/watchdog.log`, cron every 2 min: heartbeat, alerts on
  OOM/load, **auto-recovers a crash-looping `locz-api`** (stop → settle → start). Set
  `LOCZ_ALERT_WEBHOOK` / `LOCZ_ALERT_EMAIL` in the crontab for push alerts.
- Manual crash recovery, in order: `pm2 stop locz-api` (drops load immediately), free memory if
  swap-thrashing, `npm rebuild argon2 --build-from-source`, boot-check `node dist/main.js`, then
  `pm2 start locz-api`.
