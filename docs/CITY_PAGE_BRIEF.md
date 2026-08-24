# City page brief for Codex — `/in/[city]`

The data + API for rich city pages are live. Build the page against them.

## The API (done, live)

`GET /locations/cities/<slug>/content` (public) returns:

```
{
  city: { id, name, slug, nameTe, nameHi, stateName, districtName, latitude, longitude },
  population, tier,
  content: {                     // null for cities not yet profiled — render name/location anyway
    shortIntro, description, famousFor, character,
    economySummary, climate, knownFor, seoTitle, metaDescription
  },
  sections: [                    // the guide — 3–9 per city, ordered
    { key: "history"|"economy"|"culture"|"tourism"|"transport"|"education"|"geography"|"demographics"|"overview",
      title, content, sourceUrl, license, source }   // license/source MUST be shown (CC BY-SA 4.0, Wikipedia)
  ],
  images: [ { kind: "HERO"|"ATTRACTION"|"MAP", title, url, attribution, license, source, width, height } ]
}
```

- **81/96 cities** have `content` + `sections` now. `images` is currently empty — Claude is doing
  the object-storage upload next (Slice 3); the shape above is final, so build against it and the
  images populate without a UI change.
- **Attribution is not optional:** every section is used under its licence, so the page must show
  "Reference text from Wikipedia (CC BY-SA 4.0)" linking `sourceUrl`, and each image its `attribution`.

## The design (reference)

A finished mockup exists — the Hyderabad artifact (Fraunces display + Instrument Sans, LocZ green +
coral + a brass heritage accent): hero over the generated image → facts strip → about + "Famous for"
→ landmarks grid → location map (with the disputed-border caveat) → 2-column **City guide** built
from `sections` → **"Businesses near you in <city>"** panel that links into the directory (this is the
point — the guide is the SEO doorway, the directory is the payoff). Reuse LocZ's own tokens/components;
match the mockup's structure, not its literal CSS.

## Where it goes

`apps/web/src/app/in/[city]/` already exists (thin). Enrich it: hero + intro + facts from `content`,
the guide from `sections`, images from `images`, and `seoTitle`/`metaDescription` into
`generateMetadata`. Mobile gets the equivalent. Cities without `content` keep the current thin page.

## Entry points from the home page (currently missing)

Today `/in/<city>` is only reachable from a business breadcrumb and from Google — the home page
never links to it. With the pages now rich, add:

1. **On select OR auto-detect of a Tier-1/2 location → offer "About this city".** When the user
   picks a city or their location is auto-detected, and the resolved city is **tier 1 or 2**, show
   an "About <City>" affordance (chip/banner) that links to `/in/<slug>`. Only tier 1/2 have a rich
   guide page, so gate on tier. **`CityDto` now returns `tier`** (1/2/3) on every city response
   (search, `cities/:slug`, and the `resolve` endpoints) — store it with the selected city and
   check `tier === 1 || tier === 2`. For a tier-3 / unlaunched pincode, don't offer it.
2. **The location chip → the city guide.** When a tier-1/2 city is selected, make its name link to
   `/in/<slug>` (an "Explore <City>" affordance). The chip currently only _sets_ the feed city.
3. **A "Cities on LocZ" section / footer list** linking the tier-1/2 city pages — also strong SEO
   internal linking (96 crawlable hubs the home page currently doesn't point to).
