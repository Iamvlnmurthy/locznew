# URGENT Codex bugfix — /services landing navigation is broken

**Reported by user:** "services page not showing any nearby services, and clicking a service
category button redirects to the services page again."

## Diagnosis (verified live 2026-09-02)

- ✅ The provider pages WORK: `/services/ac-and-cooling-services/dlf-qe` renders real provider cards
  (verified 3 providers). The `service_area_pages` matview is healthy (23,328 pages).
- ❌ **`apps/web/src/app/services/page.tsx` line ~141**: the category cards link to
  `href={\`/services?trade=${trade.slug}\`}`. That just **re-renders `/services`** with the finder
  pre-filled — it never navigates to the category's providers. To the user, clicking a category
  "reloads the same page" and no services ever show.
- ❌ The landing has **no list of services** — only the hero + finder + category grid. So until the
  user manually uses the two-field finder, nothing is shown ("not showing any nearby services").
- ⚠️ **Category-slug reality:** the matview groups by the **leaf** category slug. Valid slugs are
  things like `ac-and-cooling-services`, `beauty-salons`, `professional-services`,
  `hospitals-and-clinics`, `financial-services`, `event-planners`, `travel-services`,
  `spas-wellness-centres`, `it-companies`, `doctor-clinics-consultation-centres`, … (NOT parent
  slugs like `salons-and-spas`). `FEATURED_TRADES` currently contains some non-existent slugs
  (`accountants`, `home-services`, `car-repair-servicing-workshops`) that get silently filtered out.

## Fix (make clicking a category actually show services)

A category alone has no page (route is `/services/[category]/[area]`), so a category click must land
on a real providers page. Options, best first:

1. **Add a `/services/[category]` route** — a category landing that lists the **areas** which have
   ≥5 providers for that category (read the matview: `SELECT locality_slug FROM service_area_pages
WHERE category_slug = $1 ORDER BY … `), each linking to `/services/[category]/[area]`. Change the
   category cards to link to `/services/${trade.slug}`. This is the correct, scalable fix and gives
   a useful mid-level page (also good for SEO — link it from the shard sitemaps).
2. **OR** link each category card straight to its **top area**:
   `/services/${trade.slug}/${topAreaSlugForThatCategory}` (fetch one valid `locality_slug` per
   featured category from the matview at render). Simpler, but arbitrary which area.

Also:

- **Fix `FEATURED_TRADES`** to use only real matview leaf slugs (pull the top ~8 by page count:
  `SELECT category_slug, count(*) FROM service_area_pages GROUP BY 1 ORDER BY 2 DESC`).
- Add a **"popular services near you"** block on the landing that actually lists a few
  `/services/[category]/[area]` links for the selected city (so the page shows services on load,
  not just a finder).
- Keep the finder as the precise search; keep claim/verify rules; keep i18n en/hi/te.

## Acceptance

- Click any category on `/services` → lands on a page that **shows providers or areas** (never
  reloads `/services`).
- `/services` shows some real service links on first load (not an empty finder).
- Every generated link resolves to a 200 page with providers (no empty `/services/[wrong-slug]/…`).
- Screenshots at 390px + 1440px; build/typecheck/lint clean.
