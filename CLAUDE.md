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
