#!/usr/bin/env bash
# Safe API deploy for the VPS. Codifies the recovery from the argon2 core-dump incident:
# a plain `npm install` can refetch argon2's prebuilt binary, which segfaults on this box and sends
# locz-api into a silent crash-loop (no error log, core dump on boot). We force a from-source argon2
# compile, regenerate the Prisma client, build, verify the api actually boots BEFORE swapping it in,
# and only then restart pm2. See memory: locz-api-argon2-crash.
#
# Run on the VPS:  sudo -u locz bash scripts/deploy-api.sh
set -uo pipefail
APP=/home/locz/app
cd "$APP"

echo ">> git reset --hard origin/master"
git fetch origin master -q && git reset --hard origin/master -q
echo "   HEAD=$(git rev-parse --short HEAD)"

echo ">> npm install (resync deps to lockfile)"
npm install >/tmp/deploy-api-npm.log 2>&1 || { echo "npm install FAILED"; tail -8 /tmp/deploy-api-npm.log; exit 1; }

# The recurrence-killer: argon2's prebuilt binary segfaults here; compile it from source every deploy.
echo ">> rebuild argon2 from source (prevents silent api core-dump)"
npm rebuild argon2 --build-from-source >/tmp/deploy-api-argon2.log 2>&1 \
  && echo "   argon2 ok" || { echo "!! argon2 rebuild FAILED"; tail -8 /tmp/deploy-api-argon2.log; exit 1; }

echo ">> prisma generate"
npm run db:generate -w @locz/api >/tmp/deploy-api-gen.log 2>&1 \
  || { echo "!! db:generate FAILED"; tail -8 /tmp/deploy-api-gen.log; exit 1; }

echo ">> build api"
# Cap heap + de-prioritise so the build can't OOM-kill Postgres on this shared box.
NODE_OPTIONS="--max-old-space-size=1536" nice -n 10 ionice -c3 \
  npm run build -w @locz/api >/tmp/deploy-api-build.log 2>&1 \
  || { echo "!! api build FAILED"; tail -12 /tmp/deploy-api-build.log; exit 1; }

# Verify the built api actually BOOTS before restarting pm2 — a core-dump on boot would otherwise
# crash-loop the live api. Boot it on a throwaway port, confirm it prints "listening", then kill it.
echo ">> boot check (throwaway)"
set -a; . ./.env 2>/dev/null || true; [ -f apps/api/.env ] && . apps/api/.env; set +a
export API_PORT=45999
( timeout 30 node apps/api/dist/main.js >/tmp/deploy-api-boot.log 2>&1 & )
BOOT_OK=0
for _ in $(seq 1 25); do
  grep -qi "listening on port" /tmp/deploy-api-boot.log && { BOOT_OK=1; break; }
  grep -qi "dumped core\|SIGSEGV" /tmp/deploy-api-boot.log && break
  sleep 1
done
pkill -f "node apps/api/dist/main.js" 2>/dev/null || true
if [ "$BOOT_OK" != "1" ]; then
  echo "!! api did NOT boot cleanly — NOT restarting live api. Log:"; tail -15 /tmp/deploy-api-boot.log
  echo "   (if this is a core dump, argon2/native modules are the usual cause)"
  exit 1
fi
echo "   boot OK"

echo ">> restart locz-api"
unset API_PORT
pm2 restart locz-api --update-env >/dev/null 2>&1
sleep 6
UP=$(pm2 jlist 2>/dev/null | grep -o '"name":"locz-api"[^}]*"status":"online"' | wc -l)
[ "$UP" -ge 1 ] && echo ">> OK: locz-api online. Deploy complete." || { echo "!! locz-api not online after restart"; exit 1; }
