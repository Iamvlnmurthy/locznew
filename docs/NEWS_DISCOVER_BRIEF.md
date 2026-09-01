# Codex Brief — Get LocZ News into Google Discover (Google App / Chrome feed)

**Goal:** Make LocZ news articles eligible to appear in the Google App feed and Chrome's
"Discover" feed on Android/iOS. Discover has **no submission** — eligibility is automatic once
pages are indexed and meet the content + technical bar. This brief covers the technical gaps we
control.

## Context (verified 2026-09-01)

- Article page: `apps/web/src/app/news/[slug]/page.tsx`.
- ✅ `NewsArticle` JSON-LD already present (line ~131) with publisher = LocZ.
- ❌ **No `robots: max-image-preview:large`** in `generateMetadata` (line ~69). Discover almost
  never shows a card without a large image preview — this alone can block us.
- ❌ **No `openGraph.images`** (line ~88 sets title/description/url/type but no image array) and no
  Twitter `summary_large_image` card.
- ⚠️ **Image sourcing is the real blocker:** cards currently show **full e-paper newspaper page
  scans** (e.g. "Photo: Mana Telangana Epaper"). This fails Discover's _high-quality, unique image_
  requirement (a scanned page is neither) **and is a copyright risk**. Discover will not surface
  stories illustrated with a competitor's scanned newspaper page.

## Tasks (priority order)

### 1. Add large-image + rich-preview robots meta (highest ROI, smallest change)

In `generateMetadata` return object, add:

```ts
robots: {
  index: true, follow: true,
  'max-image-preview': 'large',
  'max-snippet': -1,
  'max-video-preview': -1,
},
```

This is the single biggest Discover lever. Apply to BOTH the article page and the `/news` feed page.

### 2. Add `og:image` + Twitter large-image card

In `generateMetadata`, when `event.imageUrl` exists:

```ts
openGraph: { ..., images: [{ url: event.imageUrl, width: 1200, height: 630, alt: event.title }] },
twitter: { card: 'summary_large_image', title: event.title, description, images: [event.imageUrl] },
```

Discover reads og:image as a fallback and for social sharing.

### 3. Fix image sourcing (the actual gate — product decision)

E-paper scans must go. Options, best first:

- **Own/licensed imagery:** a small set of category stock images (traffic, civic, weather, sports,
  crime, business) served locally, chosen by story category — unique enough, zero copyright risk,
  always ≥1200px. Lowest effort, ships now.
- **Licensed news photo API** (e.g. a stock/agency feed we pay for) keyed by category/keywords.
- **Never** a scanned newspaper page or a hotlinked source image without a license.
  Requirement Discover enforces: images **≥1200px wide**, high-quality, relevant, and we must have
  rights. Set explicit `width`/`height` on the `<img>` to avoid CLS.

### 4. E-E-A-T signals (helps ranking within Discover)

- Add a visible **author/byline** ("LocZ Newsroom") and an **About / editorial standards** page,
  linked from articles.
- Ensure `dateModified` + `datePublished` are in the `NewsArticle` schema (verify both present).
- Keep headlines non-clickbait (the engine already enforces this).

## Acceptance

- `curl -s https://locz.in/news/<slug>` → HTML contains `max-image-preview:large` and a valid
  `og:image` pointing at a ≥1200px image that is NOT an e-paper scan.
- Rich Results Test passes for `NewsArticle` with an image.
- Build gate: `npm run build -w @locz/web` clean; sitemap spot-check unaffected.

## Out of scope

Google News _tab_ inclusion (Publisher Center — "LocZ News" already exists there) is separate from
Discover; this brief is Discover-only. Do not touch the news engine (that's the GPU box).
