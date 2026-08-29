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

## Task 1 — Home "Public Services" section (internal linking)

File: `apps/web/src/app/page.tsx`.

- Place the section **immediately after "Popular in {city}"**.
- Render the **ten fixed slugs** as an ordered allowlist. Join them against the already-fetched category
  IDs; show **city-specific counts** from the existing `category-counts` response.
- Each card = **civic SVG icon + localized name + count**, wrapped in a **server-rendered
  `<Link href="/c/{slug}">`** (crawlable anchors are the whole point — Home → Public Services →
  category → business pages).
- **Hide a category only when it has zero local results** — OR show it with its global count if you
  intend nationwide discovery (pick one and be consistent).
- Restrained, civic/official identity distinct from the commercial "Popular" grid, but on-brand.

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

### JSON-LD (important — do not fall back to `LocalBusiness`)

The three enriched types already emit `BankOrCreditUnion`, `PostOffice`, `TrainStation`. Map the other
seven to their proper schema.org types (by category slug), never generic `LocalBusiness`:

| slug                   | schema.org `@type`    |
| ---------------------- | --------------------- |
| `police-stations`      | `PoliceStation`       |
| `fire-stations`        | `FireStation`         |
| `government-hospitals` | `Hospital`            |
| `courts`               | `Courthouse`          |
| `universities`         | `CollegeOrUniversity` |
| `bus-stations`         | `BusStation`          |
| `government-offices`   | `GovernmentOffice`    |

### Icons (new work — the library is missing these)

The current icon component lacks specific **bank, post-office, police, railway, court, fire,
university, government-building, bus, hospital** icons and falls back to a generic box. **Add ten
proper civic SVG icons** for the ten categories and use them on both the home section and the pages.

## i18n (all three languages, not just home)

Add **English, Hindi and Telugu** for **every** new public-service label — the home section
(`home.publicServices*`) **and** all reframed storefront strings ("Official contact information,"
"Suggest a correction," the reframed hero/section/FAQ copy, the ten category names, etc.). Keys go in
`apps/web/src/i18n/messages/en.json`, `hi.json`, `te.json`.

## Claim enforcement — backend guard is now in place

The backend now **rejects any claim on a public-service business** (`business-claims.service.ts`:
category parent slug === `public-services` → `ConflictException`). So the UI hiding of claim controls
is backed by real enforcement — a direct `/b/{slug}/claim` or API claim call is refused. Regression 1
below should therefore see a rejection, not a silent success.

## SEE gate (acceptance)

Screenshot at **390px and 1440px**:

- (a) the home Public-Services section,
- (b) a bank page, (c) a post-office page,
- (d) a page of a type with **no** data block (e.g. a police station),
- (e) a **normal shop page** (regression — shop chrome must be intact there).

Plus:

- `git diff --check` clean; typecheck + build pass; no horizontal overflow; axe: no new violations.
- **Regression 1:** directly opening `/b/{public-service}/claim` must eventually be **rejected**, not
  merely hidden (this exposes the backend-guard gap above — record the actual behaviour).
- **Regression 2:** validate the emitted **JSON-LD for one page of each public-service subtype**
  (confirm the correct `@type`, no `LocalBusiness` fallback).

Report all findings as `file:line`.
