# Brief — Wire the Services section to service businesses

**Problem:** The Services surface (`apps/web/src/app/discover/[area]`, `services: new Set(['SERVICE'])`)
queries marketplace SERVICE _listings_ — which are ~empty. But the directory already holds
**956,338 SERVICE_PROVIDER businesses (710,550 with a phone)** across service categories
(Electrical / Plumbing / Home-repair / Cleaning / Salons / Tailoring / Bike-Car repair…). The section
looks empty despite the data existing.

**Goal:** Populate Services from service _businesses_, proximity-sorted, with call/claim tiering.

**Do:**

1. When the Services area has no/few marketplace SERVICE listings, **fall back to service-provider
   businesses**: `/businesses/nearby` filtered to `businessType=SERVICE_PROVIDER` (or the service
   categories) near the viewer's location/pincode, ordered by distance.
2. **Tier each result (never a dead call button):**
   - has phone → **Call** (`tel:`)
   - no phone → **Directions** + "Claim this business"
3. **Trade chips** at top: Electricians · Plumbers · AC repair · Carpenters · Painters · Mechanics ·
   Pest control · Cleaning · Salons · Tailors — each filters by that category.
4. Blend: owner-posted SERVICE listings first (fresh), then directory providers.
5. i18n all strings (en/hi/te); reuse the existing `BusinessSummary` card; SEE-gate 390px + 1440px.

**Don't:** turn all 956k into indexable pages — surface in-app; index selectively (that's the separate
service-area SEO page, see SERVICES_SEO_PAGE_BRIEF.md).
