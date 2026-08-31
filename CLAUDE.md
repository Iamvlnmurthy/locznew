# LocZ — build & deploy gotchas

## `NEXT_PUBLIC_SITE_URL` must be set at web BUILD time (or sitemaps break)

`apps/web/src/lib/api.ts` defines `SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'`.
Because `NEXT_PUBLIC_*` vars are **inlined into the bundle during `next build`**, a build that runs
without this env var bakes `http://localhost:3000` into every sitemap (`sitemap.xml`,
`sitemap-businesses.xml`, `sitemap-ifsc.xml`, …) and every absolute URL. Google Search Console then
rejects the sitemap with **"URL not allowed"** (all URLs point at localhost).

- The value lives in the VPS `/home/locz/app/.env` as `NEXT_PUBLIC_SITE_URL=https://locz.in`.
- `scripts/deploy-web.sh` sources `.env` before building, so deploys via that script are correct.
- **Never build web without sourcing `.env` first.** After any web deploy, spot-check:
  `curl -s https://locz.in/sitemap.xml | grep -c localhost` → must be `0`.
- If GSC shows localhost URLs, the fix is a rebuild + re-submit the sitemap in GSC (remove, re-add).

## Admin (`locz-admin`) deploy: STOP the process before rebuilding `.next`

There is no `deploy-admin.sh`. `locz-admin` runs `next start -p 3202` (Turbopack) from
`apps/admin`. Rebuilding `.next` **while the process is still running** leaves the live process
serving an old page manifest that references chunk files the rebuild deleted → the browser gets a
`500`/`404` on a chunk (e.g. `Failed to load chunk …`) → the whole view drops into the error
boundary ("That view couldn't be loaded"), even in incognito (it's a server-side build mismatch,
not cache). Chunks are Cloudflare-cached `immutable`, which is fine as long as the build is coherent.

Correct admin deploy (atomic): `pm2 stop locz-admin` → `pkill -f apps/admin` → `rm -rf apps/admin/.next`
→ source `.env`, `export NODE_ENV=production`, `npm run build -w @locz/admin` → `pm2 start locz-admin`.
Verify: fetch `/login` and confirm **every** `/_next/static/chunks/*.js` it references returns 200
(via the public URL, not just `127.0.0.1:3202`). The Turbopack build can also fail once with an
`ENOENT _buildManifest.js.tmp` on a stale `.next` — clearing `.next` first avoids it.

## Run VPS repo/git ops as `sudo -u locz`, NEVER as root

`ssh onrol` lands as **root**. Running `git fetch`/`git reset`/anything that writes into
`/home/locz/app` as root makes those files (and `.git` objects, and `package-lock.json`)
**root-owned**, after which `npm install` (run by the `locz` deploy scripts) fails with
`EACCES: permission denied, open '/home/locz/app/package-lock.json'` and git breaks for `locz`.
Always wrap repo commands: `ssh onrol "cd /home/locz/app && sudo -u locz bash -c '...'"`. If it
already happened, fix with `chown -R locz:locz /home/locz/app` (harmless `.next.bak` ENOENT noise
is fine). The `deploy-*.sh` scripts already run their git steps correctly when invoked via
`sudo -u locz bash scripts/deploy-*.sh`.
