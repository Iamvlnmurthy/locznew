# Codex Brief — Services Section UI (new, distinct design)

**Goal:** Give the services section its **own visual identity, clearly different from the business
listing UI** (`/b/[slug]`). Services is a _"find & compare a local pro"_ experience — browse by
trade, then by area, then scan providers — not a single-listing detail page. The design should feel
like a **local services marketplace**, not a directory record.

**Hard requirement:** load and follow the **`design-master`** skill workflow (Frame → Decide →
Make distinctive → Build → SEE it → Audit). This is a redesign task, so the skill is mandatory.

## Current state (verified 2026-09-01)

- ✅ `/services/[category]/[area]/page.tsx` exists and renders (200) — providers, i18n, JSON-LD,
  ≥5-provider 404 gate. **But it currently reuses the business-listing look.**
- ❌ **`/services` (section landing) is 404 — there is NO `apps/web/src/app/services/page.tsx`.**
  There's no entry point/hub for the whole section.
- Data: **956,363 `SERVICE_PROVIDER` businesses** in prod; the `service_area_pages` matview drives
  16,878 `category × area` pages (HAVING ≥5 providers with a phone).
- API: `GET /businesses/service-areas/sitemap-count` + `/service-areas/sitemap`; provider summaries
  expose phone, city slug, localized locality (see `businesses.service.ts` + `business.dto.ts`).

## What to build

### 1. `/services` — the section landing (NEW, currently 404)

A hub that makes the section feel like a product:

- A **hero** that states the promise ("Find trusted local pros near you") with a prominent
  **category + area finder** (search or two dropdowns → routes to `/services/[category]/[area]`).
- A **category grid** of the top service trades (electrician, plumber, salon, car repair,
  hospitals, home services, professional services…) each with a **distinct trade icon** (SVG, not
  emoji) — this is a key differentiator from the business UI.
- Popular areas / cities as chips.
- Link it into the app's main navigation so the section is reachable.

### 2. `/services/[category]/[area]` — redesign, DISTINCT from `/b/[slug]`

The business page is a single-record detail. This is a **ranked list of providers to compare**, so
design it as a **comparison experience**:

- A **provider card** language that is its own thing — not the business card. Show at a glance:
  name, area, a call-affordance when a phone exists (else **Directions** + **Claim this business**),
  and trust/utility signals (verified badge, distance/area, category tags). Cards should read as
  "options to choose between," with clear primary actions.
- **Claim + verify must be present on EVERY claimable store/provider** (retail, service, food — all
  types), exactly as the business page does it: show the claim CTA whenever
  `claimStatus === 'UNCLAIMED' && isClaimable !== false && !isOwner`; a claimed listing shows the
  verified badge. Do NOT hide claim/verify behind business type. The only exception is
  `isPublicService` records (banks/post/police), which show a public-record status instead — keep
  that. This is the growth funnel; never drop it in the redesign.
- **Trade-specific framing** — the category's icon + a short "what to expect / typical services"
  strip so a Kannada or Telugu reader instantly gets the context.
- **Area context** — nearby areas as chips to pivot laterally (`/services/[category]/[nearby-area]`).
- Keep the **FAQ + `Service`/`ItemList` JSON-LD** and the **≥5-provider → 404** gate.

### 3. (Optional) `/services/[category]` — a category landing listing its areas

If it helps navigation, a category page listing the areas that have ≥5 providers.

## Design direction (make it distinct)

- **Same brand tokens** as the rest of LocZ (deep green + coral; Fraunces display, Instrument Sans
  body, Anek Telugu/Devanagari for te/hi) — but a **different layout language** from `/b/[slug]`:
  the business page is document-like; services should be **grid/marketplace-like** with trade
  iconography, comparison cards, and a finder-first hero.
- One memorable element the user will recognize as "the services section" (e.g. the trade-icon
  system, or a distinctive provider-card shape). Name it in your decisions.
- Motion: a tasteful staggered reveal on the category grid / provider list; respect
  `prefers-reduced-motion`.

## Constraints

- Responsive, **no horizontal scroll** at 390px and 1440px; images bounded (aspect-ratio +
  object-fit); touch targets ≥44px.
- Full **i18n en/hi/te** (reuse the existing `services.*` message keys; add new ones as needed).
- Accessibility: contrast ≥4.5:1, visible focus, `aria-label` on icon-only controls, sequential
  headings, labels on the finder inputs.
- **Do not touch** the news engine, the import pipeline, or backend business logic — UI + the
  service-areas API summaries only. Verify the local build/typecheck/lint before calling done, and
  **screenshot** each surface (Phase 3.5).

## Acceptance

- `/services` returns 200 with a working category+area finder and a category grid (no more 404).
- `/services/[category]/[area]` is visually distinct from `/b/[slug]` (different card language +
  trade iconography), still passes the ≥5-provider gate + JSON-LD, and renders providers with
  call/directions/claim actions.
- Screenshots at 390px and 1440px; no error overlay; no broken images; `file:line` audit clean.
