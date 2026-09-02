# Codex bugfix — nearby distances are coarse (3–23km) + too few results

**Reported:** "before businesses showed from 100m, now 3.3km"; the Businesses/discover feed shows
only ~10-12 businesses (10 within 5km, 2 within 25km), no way to load more.

## Root cause 1 — the stored location coordinate is a centroid, not the locality point

Verified live: J V Colony's `localities` row has **precise** coords (17.4453947, 78.3596219), and
`/businesses/nearby` with those returns businesses **50m away** (Burugupalli Residency 0.05km). But
the app shows 3–23km, so the origin passed to the query is coarse.

`apps/web/src/app/location/location-picker.tsx`:

- `choose(city)` (line ~98) stores `city.latitude/longitude` — **city-level** coords.
- `applyPincode()` (line ~125) stores `resolved.latitude/longitude` — the **pincode centroid**.
- Only the GPS path (`location-prompt.tsx`, `location-picker` GPS branch) stores the exact point.

So when a locality/pincode is chosen (label "J V Colony, Hyderabad"), the origin is the pincode
centroid (~3.3km off), and every "nearby" distance is measured from there.

**Fix:** when the resolution identifies a specific **locality**, store the **locality's** precise
`latitude/longitude` (they exist and are accurate) instead of the pincode centroid / city point.
`resolvePincodeAction` / the location resolution should return the matched locality's coords; the
picker should prefer `locality.latitude/longitude` → then pincode centroid → then city, in that
order. This restores ~100m precision for manual selection.

## Root cause 2 — few results + no "load more"

`apps/web/src/app/search/nearby-businesses.tsx` uses an **infinite-scroll sentinel** (no button) —
appends the next page when the sentinel scrolls into view. With the coarse origin in a sparse spot,
the radius query returns few rows, so it looks capped at ~12. Fixing coordinate #1 alone will
surface far more nearby businesses.

Still, please also:

- **Verify the infinite-scroll sentinel actually fires** (IntersectionObserver mounted, `hasNextPage`
  wired from the API `hasNextPage`/`total`). If it's not triggering, results stop at page 1 (~20).
- Show a **count / "showing N of M"** and, as a fallback for no-JS / reliability, a visible
  **"Load more"** button that pages the same server action.
- Confirm the API `/businesses/nearby` returns `hasNextPage`/`total` so the client knows there's more
  (the response has `distanceMeters` per item; ensure paging metadata is present too).

## Acceptance

- Selecting a locality (e.g. "J V Colony") → nearby businesses read ~0.1–1km, not 3–23km.
- The Businesses/discover feed loads more than one page (infinite scroll fires, or a Load-more
  button), and shows a total count.
- GPS path unchanged (already precise).
