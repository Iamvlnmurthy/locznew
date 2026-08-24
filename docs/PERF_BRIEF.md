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

## 3. Render-blocking + unused CSS — ~1,240 ms + 61 KiB — **now the #1 MOBILE lever**

Two Next CSS chunks block first render (`chunks/…css`, 74.8 KiB, ~1,240 ms) and ~61 KiB is unused
above the fold. On desktop this was minor; **on mobile it's the top issue** (see mobile update
below). Trim global CSS and keep route-level styles out of the shared chunk.

---

## Mobile update — 2026-08-24, 10:58 (Performance 72)

Desktop is fixed (**93** — the ad-gating + your LCP `priority` landed). Mobile tells a different
story: **TBT 20 ms, CLS 0** (the ad-gating carried over — great), but **LCP 8.0 s** is the whole
score. Two causes, both yours:

1. **The LCP `priority` isn't landing on the mobile-LCP image.** Desktop improved, mobile didn't.
   The bento grid reorders visually with CSS, so on the single-column mobile layout the
   _visually-first_ card is probably **not** source-index 0 — so `priority={i === 0}` prioritises
   the wrong image. Confirm which element PageSpeed reports as LCP on mobile and put `priority`
   on that one (or `priority` on whichever card renders first at mobile width).
2. **Render-blocking CSS (~1,240 ms)** — #3 above. On mobile's throttled CPU/network this is over
   a second before LCP can even paint. This is now the biggest single lever on mobile.
3. **Image delivery — 42 KiB.** The discovery-card art can be compressed harder / served at a
   smaller size for mobile (they're 72px but the source webp is larger than needed).

TBT/ads are done; nothing more from Claude's side. These three are CSS/image work in `apps/web`.

## Not doing (deliberate)

- **Ad/GTM JS weight beyond the gate** — once ads are enabled the AdSense stack returns; the
  ad-slot system already lazy-mounts below-fold slots via IntersectionObserver, which is the
  right shape. No further change until ads are switched on.
