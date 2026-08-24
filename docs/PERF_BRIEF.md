# Perf brief for Codex — desktop PageSpeed 71 (Aug 24 2026)

The app itself is fast — **FCP 0.4s, CLS 0, Accessibility 100, SEO 100**. The score is dragged
down by third-party JS and one lazy-loaded LCP image. Two of the three fixes are already done
(this side); the rest live in `apps/web/**`, which is yours.

## Already shipped (Claude, commit `76f9029`)

- **AdSense gated on `ADS_ENABLED`** (`apps/web/src/app/layout.tsx`). It was loaded
  unconditionally for one-time verification (done) and pulled in the Funding Choices consent
  stack — ~280 KiB of main-thread work and the bulk of TBT, for zero rendered ads. Verified
  gone from live HTML.
- **`.browserslistrc` modern floor** (`apps/web/.browserslistrc`) — drops ~14 KiB of legacy
  polyfills (Array.at/flat/flatMap, Object.fromEntries/hasOwn, String.trimEnd).

## 1. LCP image is lazy-loaded — highest remaining impact (yours)

PageSpeed "LCP request discovery" flags the LCP element — the first home discovery-card art
image — as `loading="lazy"` with no `fetchpriority="high"`. Result: **2,060 ms resource load
delay**, the whole of the 2.3s LCP.

**File:** `apps/web/src/app/page.tsx`, the `heroAreas.map(...)` block at ~line 369.

**Change:** give the first card's `<Image>` the `priority` prop (Next sets `loading="eager"` +
`fetchpriority="high"` + a preload). It is lazy by default.

```tsx
// before
{heroAreas.map(({ area, count }) => (
  ...
      <Image src={premiumDiscoveryArtwork(area)} alt="" width={72} height={72} sizes="72px" />
// after
{heroAreas.map(({ area, count }, i) => (
  ...
      <Image src={premiumDiscoveryArtwork(area)} alt="" width={72} height={72} sizes="72px"
             priority={i === 0} />
```

Expected: LCP 2.3s → ~1s, Performance into the 80s–90s. Confirm with a fresh PageSpeed run.

## 2. Geolocation requested on page load — Best Practices 96 ding (yours)

PageSpeed Best Practices flags "Requests the geolocation permission on page load." This is the
`LocationPrompt` in `layout.tsx` / `apps/web/src/components` firing on load. `docs/AUDIT_AND_REMAINING_WORK.md`
already argued for contextual permission: ask when the user does something location-shaped, and
on refusal show the pincode fallback (which already exists). Cold-start prompts are granted ~half
as often and Play flags them.

## 3. Render-blocking + unused CSS — ~600 ms + 60 KiB (lower priority, yours)

Two Next CSS chunks block first render (`chunks/…css`, 74.8 KiB, 1,300 ms) and ~60 KiB is unused
above the fold. Mostly Next's CSS handling; realistic wins are trimming global CSS and keeping
route-level styles out of the shared chunk. Do this after 1 and 2 — they move the score most.

## Not doing (deliberate)

- **Ad/GTM JS weight beyond the gate** — once ads are enabled the AdSense stack returns; the
  ad-slot system already lazy-mounts below-fold slots via IntersectionObserver, which is the
  right shape. No further change until ads are switched on.
