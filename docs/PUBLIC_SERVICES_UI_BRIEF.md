# Codex task — Public Services UI (LocZ)

> **Scope:** UI-only, in `apps/web`. Do NOT change the API or enrichment services. Follow the
> **design-master** workflow (frame → decide → make distinctive → build → SEE via real screenshots →
> a11y audit). Brand: deep green + coral; Fraunces / Instrument Sans / Anek Telugu. Reuse existing
> components/styles. **SVG icons only** (see the icon requirement below). Mobile-first, WCAG-AA
> contrast, visible focus, honour `prefers-reduced-motion`. No fabricated data. No new routes.

## Context (already done — do NOT redo)

A **"Public Services"** category tree was created and **~245,856 businesses recategorized** into it.
Parent category slug: **`public-services`**. Ten direct children (slug — current national count):

| slug                   |   count | slug                 | count |
| ---------------------- | ------: | -------------------- | ----: |
| `banks-atms`           | 179,626 | `railway-stations`   | 4,907 |
| `post-offices`         |  25,402 | `government-offices` | 2,528 |
| `government-hospitals` |  13,326 | `bus-stations`       | 2,389 |
| `police-stations`      |   9,167 | `courts`             |   958 |
| `universities`         |   6,969 | `fire-stations`      |   584 |

- Category pages already render at **`/c/[slug]`**.
- Business pages `/b/[slug]` (`apps/web/src/app/b/[slug]/page.tsx`) already render authoritative blocks
  from `BusinessDetail`: `banking` → `banking-details.tsx`, `postOffice` → `post-office-details.tsx`,
  `railway` → `railway-details.tsx`.
- The API exposes **`business.isPublicService: boolean`** on `BusinessDetail`
  (`businesses.service.ts` `toDetail`, ~line 1240) — true iff the category's parent slug is
  `public-services`. **This is reliable for all ten direct child categories. Use it as THE signal.**

## ⚠️ Corrected data facts (do not assume otherwise)

- **`GET /businesses/categories` returns only `id`, `slug`, English `name`, and `count`** — NOT
  `parentId`, `nameTe`, or `nameHi` (`businesses.service.ts` ~line 235). So you **cannot** discover the
  public-service children or their translations from that endpoint.
  → **Use a fixed ten-slug allowlist** (the slugs above, in that order), **translated i18n labels you
  add yourself**, and the existing **`category-counts`** response for per-city counts. **Do NOT add a
  new API endpoint.**
- `category-counts` gives city-specific counts; join the ten fixed slugs against the already-fetched
  category IDs / counts rather than re-querying.

## The fixed ten-slug allowlist (in THIS order)

1. `banks-atms`
2. `post-offices`
3. `government-hospitals`
4. `police-stations`
5. `universities`
6. `railway-stations`
7. `government-offices`
8. `bus-stations`
9. `courts`
10. `fire-stations`

Use this exact order everywhere the categories are listed.

## Task 1 — Home "Public Services" section (internal linking)

File: `apps/web/src/app/page.tsx`.

- Place the section **immediately after "Popular in {city}"**.
- Render the ten fixed slugs (order above). Join them against the already-fetched category IDs; show
  **city-specific counts** from the existing `category-counts` response.
- Each card = **civic SVG icon + localized name + count**, wrapped in a **server-rendered
  `<Link href="/c/{slug}">`** (crawlable anchors are the point — Home → Public Services → category →
  business pages). **This requires Task 1b — `/c/[slug]` does not currently list businesses.**
- **Zero-count behaviour (decided — do this, don't choose):** on the **home** section, show **only the
  categories that have local results** (hide zero-count ones). The **national `/c` category page** (Task
  1b) keeps **all ten** available regardless of the viewer's city.
- Restrained, civic/official identity distinct from the commercial "Popular" grid, but on-brand.

## Task 1b — `/c/[slug]` must actually list public-service BUSINESSES (critical)

**The internal-link chain does not currently exist.** `apps/web/src/app/c/[slug]/page.tsx` (~line 80)
queries `/search`, receives `ListingSummary[]`, and renders marketplace **`ListingCard`** components — so
`/c/{public-service-slug}` shows marketplace listings, not the recategorized businesses, and links
nowhere useful.

- **Required (recommended path — preserves the crawlable `/c/{slug}` architecture, no new routes):**
  make `/c/[slug]` **detect the ten public-service slugs** and, for those, render **`BusinessSummary`
  cards that link to `/b/{slug}`** (query businesses in that category, e.g. via the business listing/
  search API filtered by `categoryId`, paginated, server-rendered). Non-public-service slugs keep their
  current marketplace behaviour untouched.
- **Remove marketplace language on public-service `/c` pages:** no "Free to list", no listing-oriented
  empty-state "Post …" CTA, no marketplace copy — use civic/directory wording.
- **Localize the child-category name** on the parent `public-services` page — it currently renders
  `child.name` directly (`c/[slug]/page.tsx` ~line 189); use the localized label for the viewer's locale.
- (Alternative, only if the above is infeasible: link home cards to `/in/{city}/{category}` for
  city-specific discovery — but that loses the national category landing page. Prefer the `/c` fix.)

## Task 2 — Reframe public-service business pages (`/b/[slug]`)

When **`business.isPublicService === true`**, present an **authoritative information page, not a shop**.
Handle **all** of these storefront elements:

**Remove:**

- Hero **enquiry** and **WhatsApp** actions.
- Mobile sticky **WhatsApp / enquiry** actions.
- The **unclaimed-business message** and the **claim card** ("Claim this business" / "Claim in 30s" /
  "Is this your business?").
- The **"Post free ad"** promotional card on these pages.
- Commercial **FAQ** entries about pricing, products and WhatsApp enquiries (suppress those Q&As).

**Keep:**

- Official **phone, website, email** and **Get-directions / map**.
- The authoritative data block (`banking` / `postOffice` / `railway`) where present.
- Hours (if present), breadcrumb.

**Replace / reframe:**

- Contact sidebar → an **"Official contact information"** panel.
- Provenance panel: remove or reframe **"Not claimed by the business"**.
- **"Report this business" → "Suggest a correction."**
- Hero **"Local business"** label → the public-service category (e.g. "Public Service · Post Office").
- Reframe copy: **"Meet the business," "About business," "Specialties & Services,"** and the
  **nearby-business** wording so none of it reads as a shop.

The **seven types without a data block** (hospitals, police, fire, courts, govt offices, bus,
universities) get **only** the reframe — no invented data.

### JSON-LD — map ALL ten by `business.categorySlug` (not by enrichment presence)

**Gotcha:** the current page selects `BankOrCreditUnion`/`PostOffice`/`TrainStation` only when the
enrichment block matched (`page.tsx` ~line 634), so an **unmatched** bank / post office / railway
station still falls back to generic `LocalBusiness`. Fix this: map **all ten categories by
`business.categorySlug`** (available on `BusinessDetail`), **regardless of whether the banking /
post-office / railway enrichment matched**. Never `LocalBusiness` for a public service.

| slug               | schema.org `@type`  | slug                   | schema.org `@type`    |
| ------------------ | ------------------- | ---------------------- | --------------------- |
| `banks-atms`       | `BankOrCreditUnion` | `courts`               | `Courthouse`          |
| `post-offices`     | `PostOffice`        | `universities`         | `CollegeOrUniversity` |
| `railway-stations` | `TrainStation`      | `bus-stations`         | `BusStation`          |
| `police-stations`  | `PoliceStation`     | `government-offices`   | `GovernmentOffice`    |
| `fire-stations`    | `FireStation`       | `government-hospitals` | `Hospital`            |

### Icons (new work — the library is missing these)

The current icon component lacks specific **bank, post-office, police, railway, court, fire,
university, government-building, bus, hospital** icons and falls back to a generic box. **Add ten
proper civic SVG icons** for the ten categories and use them on both the home section and the pages.

## i18n (all three languages, not just home)

Add **English, Hindi and Telugu** for **every** new public-service label — the home section
(`home.publicServices*`) **and** all reframed storefront strings ("Official contact information,"
"Suggest a correction," the reframed hero/section/FAQ copy, the ten category names, etc.). Keys go in
`apps/web/src/i18n/messages/en.json`, `hi.json`, `te.json`.

## Claim enforcement

- **Backend (done):** the claim service now **rejects any claim submission on a public-service
  business** (`business-claims.service.ts`: category parent slug === `public-services` →
  `ConflictException`), with a unit test. A direct claim POST is refused.
- **Claim page (Task for you):** visiting **`/b/{slug}/claim`** may still render the claim form even
  though submission is refused. Make **`apps/web/src/app/b/[slug]/claim/page.tsx` inspect
  `business.isPublicService`** and, when true, **`redirect()` back to the public-service profile
  (`/b/{slug}`) or return `notFound()`** — do not render the form at all. This closes the gap between a
  refused POST and a still-visible form.

## SEE gate (acceptance)

Screenshot at **390px and 1440px**:

- (a) the home Public-Services section,
- (b) a **`/c/{public-service-slug}`** category page (the middle step in the internal-link path — must
  show BusinessSummary cards linking to `/b/`, no marketplace chrome),
- (c) a bank page, (d) a post-office page,
- (e) a page of a type with **no** data block (e.g. a police station),
- (f) a **normal shop page** AND a **normal `/c` category page** (regression — marketplace behaviour must
  be intact for non-public-service slugs).

Plus:

- `git diff --check` clean; typecheck + build pass; no horizontal overflow; axe: no new violations.
- **Regression 1:** opening `/b/{public-service}/claim` must **redirect / notFound** (not render the
  form), and a direct claim POST must be **rejected** (backend guard already does this).
- **Regression 2:** validate the emitted **JSON-LD for one page of each public-service subtype** —
  confirm the correct `@type` selected **by `categorySlug`**, with **no `LocalBusiness` fallback** even
  when the enrichment block did not match.

Report all findings as `file:line`.
