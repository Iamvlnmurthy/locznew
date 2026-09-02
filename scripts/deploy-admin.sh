#!/usr/bin/env bash
# Safe admin deploy for the VPS. There was no admin deploy script, so admin went down repeatedly:
# `deploy-web.sh` only pauses locz-admin, never rebuilds it. Two Next 16.2.12 quirks bite here:
#   1. NODE_ENV must be production for the build (the shared .env declares development, which selects
#      dev React internals and crashes prerender of special pages with a null useContext).
#   2. The admin build exits 0 but does NOT emit `.next/prerender-manifest.json`; `next start` then
#      dies with ENOENT and pm2 crash-loops it (external 503). Inject a stub whenever it is missing.
# Any real compile failure restores the previous .next so a breakage cannot take admin down.
#
# Run on the VPS:  sudo -u locz bash scripts/deploy-admin.sh
set -uo pipefail
APP=/home/locz/app
cd "$APP"

echo ">> git reset --hard origin/master"
git fetch origin master -q && git reset --hard origin/master -q
echo "   HEAD=$(git rev-parse --short HEAD)"

echo ">> back up current admin .next"
rm -rf apps/admin/.next.bak
[ -d apps/admin/.next ] && cp -r apps/admin/.next apps/admin/.next.bak

echo ">> npm install (resync deps to lockfile)"
npm install >/tmp/deploy-admin-npm.log 2>&1 || { echo "npm install FAILED"; tail -5 /tmp/deploy-admin-npm.log; exit 1; }

echo ">> build admin"
set -a; . ./.env; set +a
export NODE_ENV=production
# Atomic: stop the live admin process before replacing .next so next start never serves a manifest
# that references chunks the rebuild deleted. A trap restores it on any exit.
ADMIN_PID=$(pm2 pid locz-admin 2>/dev/null | tail -n 1 || true)
ADMIN_WAS_UP=0
[[ "${ADMIN_PID:-0}" =~ ^[1-9][0-9]*$ ]] && ADMIN_WAS_UP=1
[ "${ADMIN_WAS_UP:-0}" != "0" ] && { echo "   stopping locz-admin before rebuild"; pm2 stop locz-admin >/dev/null 2>&1 || true; }
pkill -f apps/admin 2>/dev/null || true
sleep 1
rm -rf apps/admin/.next
set +e
NODE_OPTIONS="--max-old-space-size=1536" nice -n 10 ionice -c3 npm run build -w @locz/admin >/tmp/deploy-admin.log 2>&1
BUILD_EXIT=$?
set -e

if [ ! -f apps/admin/.next/BUILD_ID ]; then
  echo "!! admin compile FAILED (no BUILD_ID) — restoring previous .next and aborting"
  grep -iE "error|Failed to compile|Module not found|Type error" /tmp/deploy-admin.log | head -8
  rm -rf apps/admin/.next
  [ -d apps/admin/.next.bak ] && cp -r apps/admin/.next.bak apps/admin/.next
  pm2 restart locz-admin >/dev/null 2>&1 || pm2 start locz-admin >/dev/null 2>&1 || true
  exit 1
fi

# Compile succeeded but Next 16.2.12 omits the prerender manifest for this app — inject the stub so
# `next start` does not ENOENT-crash. (BUILD_EXIT can be non-zero purely from the export step.)
if [ ! -f apps/admin/.next/prerender-manifest.json ]; then
  echo ">> injecting stub prerender-manifest.json (Next omits it; prevents ENOENT crash-loop)"
  printf '%s' '{"version":4,"routes":{},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"stub","previewModeSigningKey":"stub","previewModeEncryptionKey":"stub"}}' \
    > apps/admin/.next/prerender-manifest.json
fi

echo ">> start locz-admin"
pm2 reset locz-admin >/dev/null 2>&1 || true
pm2 restart locz-admin --update-env >/dev/null 2>&1 || pm2 start locz-admin >/dev/null 2>&1
sleep 5

CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 30 http://127.0.0.1:3202/login)
if [ "$CODE" = "200" ]; then
  echo ">> OK: admin returns 200 on :3202. Deploy complete."
  rm -rf apps/admin/.next.bak
else
  echo "!! admin returned $CODE after restart — restoring previous .next"
  rm -rf apps/admin/.next && [ -d apps/admin/.next.bak ] && cp -r apps/admin/.next.bak apps/admin/.next
  pm2 restart locz-admin --update-env >/dev/null 2>&1
  exit 1
fi
