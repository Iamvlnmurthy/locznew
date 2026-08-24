# Brief for Codex — put AdSense in the right places (curated, not Auto)

AdSense is approved. The kill-switch and client id are already set on the VPS (`/home/locz/app/.env`),
so ads go live the moment `apps/web` builds and deploys. This brief is the `apps/web` work to make the
placements correct. **Owner: Codex** (it's all `apps/web` + the `AdSlot` component). Backend/env is done.

## 0. Build blocker — resolved 2026-08-24

The custom `global-error.tsx` boundary is present and `npm run build -w @locz/web` now passes with
the curated ad configuration enabled. Keep the production build in the deployment gate.

## 1. The 4 ad units you created (client `ca-pub-8770090838058652`)

| Unit slot    | Format                           | `<ins>` attributes that MUST be emitted                         |
| ------------ | -------------------------------- | --------------------------------------------------------------- |
| `2908301106` | **Display** (responsive)         | `data-ad-format="auto"` `data-full-width-responsive="true"`     |
| `5039640428` | **In-feed** (native, in lists)   | `data-ad-format="fluid"` `data-ad-layout-key="-6t+ed+2i-1n-4w"` |
| `5110853266` | **In-article** (native, in body) | `data-ad-format="fluid"` `data-ad-layout="in-article"`          |
| `4022956703` | **Multiplex** (related grid)     | `data-ad-format="autorelaxed"`                                  |

`AdSlot` (`apps/web/src/components/ad-slot.tsx`) now emits the exact attributes for all four formats.

## 2. Extend `AdSlot` to support formats (small, contained change)

- Add a `format` field to each placement in `apps/web/src/lib/ads/placements.ts`:
  `'display' | 'in-feed' | 'in-article' | 'multiplex'`.
- In `AdSlot`, switch the `<ins>` attributes on `config.format` (map above). Keep everything else — the
  four gates (`ADS_ENABLED`, client, slot id, content score), lazy IntersectionObserver, reserved space,
  `aria-label="Advertisement"`, and "render nothing unless live". Don't regress those.
- `data-ad-slot` still comes from the per-placement env var (`slotIdFor`), so each placement can point at
  whichever unit its format needs.

## 3. Placement map (where each unit goes)

Existing placements — set `format` + point its env var at the matching unit:

| Placement                 | Format     | Unit         | Env var (already exists)                      |
| ------------------------- | ---------- | ------------ | --------------------------------------------- |
| `BUSINESS_AFTER_ABOUT`    | in-article | `5110853266` | `NEXT_PUBLIC_AD_SLOT_BUSINESS_AFTER_ABOUT`    |
| `BUSINESS_AFTER_LOCATION` | display    | `2908301106` | `NEXT_PUBLIC_AD_SLOT_BUSINESS_AFTER_LOCATION` |
| `BUSINESS_BEFORE_NEARBY`  | multiplex  | `4022956703` | `NEXT_PUBLIC_AD_SLOT_BUSINESS_BEFORE_NEARBY`  |
| `HOME_AFTER_LOCAL_NOW`    | display    | `2908301106` | `NEXT_PUBLIC_AD_SLOT_HOME_AFTER_LOCAL_NOW`    |
| `HOME_AFTER_BUSINESSES`   | in-feed    | `5039640428` | `NEXT_PUBLIC_AD_SLOT_HOME_AFTER_BUSINESSES`   |
| `SEARCH_IN_FEED`          | in-feed    | `5039640428` | `NEXT_PUBLIC_AD_SLOT_SEARCH_IN_FEED`          |

(I currently have all six env vars set to the display unit `2908301106` as a safe interim so ads work the
moment web builds. Once you add format support, update the env values per the table — tell me and I'll set
them, or I'll do it when you push.)

New placements for the **news pages** (coming — the `news_stories` feed + article pages):

| New placement          | Format     | Unit         | New env var                                |
| ---------------------- | ---------- | ------------ | ------------------------------------------ |
| `NEWS_ARTICLE_TOP`     | display    | `2908301106` | `NEXT_PUBLIC_AD_SLOT_NEWS_ARTICLE_TOP`     |
| `NEWS_ARTICLE_IN_BODY` | in-article | `5110853266` | `NEXT_PUBLIC_AD_SLOT_NEWS_ARTICLE_IN_BODY` |
| `NEWS_FEED_IN_LIST`    | in-feed    | `5039640428` | `NEXT_PUBLIC_AD_SLOT_NEWS_FEED_IN_LIST`    |
| `NEWS_ARTICLE_RELATED` | multiplex  | `4022956703` | `NEXT_PUBLIC_AD_SLOT_NEWS_ARTICLE_RELATED` |

The **in-article** unit is the important one for news: one ad after ~paragraph 2, never more than the body
length justifies (see policy below).

City-guide placements added 2026-08-24:

| Placement             | Format     | Initial unit | Rule                                                  |
| --------------------- | ---------- | ------------ | ----------------------------------------------------- |
| `CITY_AFTER_LOCATION` | display    | `2908301106` | After the map; requires at least three guide sections |
| `CITY_GUIDE_IN_BODY`  | in-article | `5110853266` | After guide card two; requires at least four sections |

The existing same-format units are the launch fallback, so the placements work with the current VPS
environment. Dedicated `NEXT_PUBLIC_AD_SLOT_CITY_AFTER_LOCATION` and
`NEXT_PUBLIC_AD_SLOT_CITY_GUIDE_IN_BODY` values can override them later for city-specific reporting.
No city advertisement is allowed in the hero, facts strip, introduction, or directory results.

## 4. Two requirements that BLOCK monetization if missed

1. **`apps/web/public/ads.txt`** must exist and be served at `https://locz.in/ads.txt` with exactly:
   `google.com, pub-8770090838058652, DIRECT, f08c47fec0942fa0`
   Without it AdSense limits/blocks serving. (One line, commit it.)
2. **Turn OFF Auto Ads** in the AdSense dashboard (Ads → By site → Auto ads OFF for locz.in). Otherwise
   Google injects ads anywhere and the UI is disturbed — the exact problem we're avoiding. Curated
   placements + Auto Ads off = we control every position. _(This is a dashboard action, not code.)_

## 5. Policy / UX guardrails (keep these)

- **Content-score gating already exists** (`minContentScore` per placement) — keep it. Never show ads on a
  thin page (a 60-word news stub gets 0–1 ads, not 4). Tie news ad count to body length.
- Reserve space (the `--ad-reserve-*` vars) so ads don't cause CLS.
- `hreflang` news variants (en/hi/regional) still each carry the same curated slots.
- Respect the sitemap cap you set (13,689 URLs / 45-category taxonomy) — news pages join sitemaps under
  that same discipline, not an explosion.

## Definition of done

- `npm run build -w @locz/web` passes; `/ads.txt` returns 200 with the line above; the four formats each
  render their correct `<ins>`; ads appear only at the defined placements (Auto Ads off); no CLS from ads;
  content-score gating intact. Ping me to flip the env slot values + rebuild/deploy.
