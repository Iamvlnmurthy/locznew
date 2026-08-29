#!/usr/bin/env bash
# Safe web deploy for the VPS. Production mode is enforced after loading the shared environment;
# this prevents the historical Next 16.2.12 `/_global-error` prerender failure caused by the
# development React runtime. The narrowly scoped stub remains only as an emergency fallback, and
# any other failure restores the previous build so a real breakage cannot take the site down.
#
# Run on the VPS:  sudo -u locz bash scripts/deploy-web.sh
set -uo pipefail
APP=/home/locz/app
cd "$APP"

echo ">> git reset --hard origin/master"
git fetch origin master -q && git reset --hard origin/master -q
echo "   HEAD=$(git rev-parse --short HEAD)"

echo ">> back up current .next"
rm -rf apps/web/.next.bak
[ -d apps/web/.next ] && cp -r apps/web/.next apps/web/.next.bak

echo ">> npm install (resync deps to lockfile)"
npm install >/tmp/deploy-npm.log 2>&1 || { echo "npm install FAILED"; tail -5 /tmp/deploy-npm.log; exit 1; }

# npm install can refetch argon2's prebuilt binary, which segfaults on this box and silently
# crash-loops locz-api on its next restart (see memory: locz-api-argon2-crash). Force a from-source
# compile every time so a deploy can never reintroduce the crash. Cheap and idempotent.
echo ">> rebuild argon2 from source (prevents silent api core-dump)"
npm rebuild argon2 --build-from-source >/tmp/deploy-argon2.log 2>&1 \
  && echo "   argon2 ok" || { echo "!! argon2 rebuild FAILED"; tail -8 /tmp/deploy-argon2.log; exit 1; }

echo ">> build web"
set -a; . ./.env; set +a
# `.env` is also used by local development and currently declares NODE_ENV=development. A
# production Next build must never inherit that value: it selects development React internals
# while Next is prerendering production special pages, which crashes `/_global-error` with a
# null `useContext`. Public variables stay sourced above; only the execution mode is corrected.
export NODE_ENV=production
# `next build` on this shared 15GB box can spike ~1-2GB and trip the OOM-killer (which has killed
# Postgres mid-deploy). Shed load while building: pause the non-public admin app, cap the build's
# heap, and de-prioritise it for CPU/IO. Stop the current web process before replacing `.next`:
# otherwise Next can recreate fetch-cache entries while `rm -rf` is removing them, leaving a
# partial build or an unwritable prerender cache. A trap guarantees both services return on exit.
ADMIN_WAS_UP=$(pm2 jlist 2>/dev/null | grep -c '"name":"locz-admin".*"status":"online"' || true)
WEB_WAS_UP=$(pm2 jlist 2>/dev/null | grep -c '"name":"locz-web".*"status":"online"' || true)
[ "${ADMIN_WAS_UP:-0}" != "0" ] && { echo "   pausing locz-admin during build"; pm2 stop locz-admin >/dev/null 2>&1 || true; }
[ "${WEB_WAS_UP:-0}" != "0" ] && { echo "   pausing locz-web before replacing .next"; pm2 stop locz-web >/dev/null 2>&1 || true; }
restore_services() {
  [ "${WEB_WAS_UP:-0}" != "0" ] && pm2 start locz-web >/dev/null 2>&1 || true
  [ "${ADMIN_WAS_UP:-0}" != "0" ] && pm2 start locz-admin >/dev/null 2>&1 || true
}
trap restore_services EXIT
rm -rf apps/web/.next
set +e
NODE_OPTIONS="--max-old-space-size=1536" nice -n 10 ionice -c3 npm run build -w @locz/web >/tmp/deploy-web.log 2>&1
BUILD_EXIT=$?
set -e

if [ "$BUILD_EXIT" -ne 0 ]; then
  # Accept ONLY the known /_global-error export failure; abort on anything else.
  if [ -f apps/web/.next/BUILD_ID ] && grep -q "/_global-error" /tmp/deploy-web.log \
     && ! grep -qiE "Failed to compile|Module not found|Type error" /tmp/deploy-web.log; then
    echo ">> known /_global-error export failure — injecting stub manifest (compile was clean)"
    printf '%s' '{"version":4,"routes":{},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"stub","previewModeSigningKey":"stub","previewModeEncryptionKey":"stub"}}' \
      > apps/web/.next/prerender-manifest.json
  else
    echo "!! UNEXPECTED build failure — restoring previous .next and aborting"
    grep -iE "error|Failed to compile|Module not found|Type error" /tmp/deploy-web.log | head -8
    rm -rf apps/web/.next
    [ -d apps/web/.next.bak ] && cp -r apps/web/.next.bak apps/web/.next
    exit 1
  fi
fi

echo ">> restart locz-web"
pm2 restart locz-web --update-env >/dev/null 2>&1
sleep 5

CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 30 https://locz.in/in/hyderabad)
if [ "$CODE" = "200" ]; then
  echo ">> OK: site returns 200. Deploy complete."
  rm -rf apps/web/.next.bak
else
  echo "!! site returned $CODE after restart — restoring previous .next"
  rm -rf apps/web/.next && cp -r apps/web/.next.bak apps/web/.next
  pm2 restart locz-web --update-env >/dev/null 2>&1
  exit 1
fi
