# Brief — Service-area SEO page `/services/[category]/[area]`

**Goal:** high-intent programmatic pages like "Electricians in Gachibowli, Hyderabad", backed by
real callable providers. Backend is DONE (see below); this brief is the **page** only.

## Backend already built (do not rebuild)

- Materialized view `service_area_pages(category_slug, locality_slug, provider_count)` — 16,878
  category+locality pairs with **>= 5 contactable providers** (the quality gate). ~40ms reads.
- Sitemap route `sitemap-services.xml` exists (dormant — not in robots until this page ships).
- Provider data: reuse the existing business query — `listPublic` accepts `categoryId` + a locality
  filter, or `/businesses/nearby`. Resolve `category` slug → categoryId via `/businesses/categories`;
  resolve the locality by its slug (localities table has `slug`, `name`, `cityId`, `nameTe`, `nameHi`).

## Build `apps/web/src/app/services/[category]/[area]/page.tsx`

1. Fetch providers for `category` + `area` (locality slug). **`notFound()` if < 5 providers** — never
   a thin/doorway page.
2. **H1:** "Electricians in Gachibowli, Hyderabad" (category name + locality name + city).
3. Render `BusinessSummary` cards with **call/claim tiering** (never a dead call button):
   - has phone → **Call** (`tel:`)
   - no phone → **Directions** + "Claim this business"
4. Show provider **count** + a short area blurb + a **3-item FAQ** ("How many electricians in
   Gachibowli?", "Are they verified?", "How to book?").
5. **JSON-LD:** `ItemList` of `LocalBusiness` + `FAQPage`. Self-canonical, OpenGraph.
6. **Trade chips** linking sibling categories in the same area; link back to `/c/[category]` and
   `/in/[city]`.
7. i18n en/hi/te (use locality `nameTe`/`nameHi`). SEE-gate at 390px + 1440px.

## After this ships (Claude will do)

- Add `sitemap-services.xml` to `robots.ts`.
- Wire a daily `REFRESH MATERIALIZED VIEW CONCURRENTLY service_area_pages`.
- Phase the sitemap to top metros first (crawl-budget discipline — the domain has ~1.95M pages
  already discovered-not-indexed).
