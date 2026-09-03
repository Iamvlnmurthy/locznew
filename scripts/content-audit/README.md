# Content audit — how similar are two storefronts?

Measures near-duplicate overlap between business pages, which is what decides whether Google
serves them or collapses them behind _"we have omitted some entries very similar to the ones
already displayed"_.

Run it **before** shipping any change to page content, not after.

## Usage

```bash
# 1. Build a stratified sample (categories x cities x N per group).
#    Same-category/same-city pairs are the ones that matter, so the sample must contain many.
psql ... -At -f sample.sql > sample_raw.json   # see "Sampling" below

# 2. Measure.
python crosscheck.py sample20k.json result.json
```

Output:

```
site furniture: 256 shared 5-grams removed (present on >=60% of 18721 pages)
SAME CATEGORY + SAME CITY    {'n': 37229, 'median': 17.9, 'p90': 33.8, 'over_30pct': 15.7}
DIFFERENT CATEGORY (control) {'n': 800, 'median': 1.4, 'p90': 4.0, 'over_30pct': 0.0}
```

| Median overlap | Reading                             |
| -------------- | ----------------------------------- |
| `< 15%`        | Pages read as distinct.             |
| `15–30%`       | Template-heavy but survivable.      |
| `> 30%`        | Search engines will collapse these. |

The **control** is the check on the method: unrelated pages should land near 1–2%. If the control
rises, the extraction or the furniture filter has broken and the headline number means nothing.

## Four things that make this non-obvious

**The visible copy is not in `<main>`.** Pages stream as React Server Component flight data, so
`<main>` holds "LocZ Loading". `pagetext.py` reassembles `self.__next_f.push([1,"..."])` chunks and
keeps the strings that read as prose. Component and prop names must be filtered — they are
identical on every page and would drive any two toward 100%.

**Site furniture is removed by measurement, not by a hand-written list.** Any 5-gram appearing on
≥60% of sampled pages is header, footer, buttons or legal text. Without this step unrelated pages
measure **50.7%** similar, which says nothing about content. This threshold materially sets the
headline number; it is a judgement call worth arguing with.

**Every fetch is cache-busted.** Cloudflare caches this site's HTML despite the origin sending
`no-store`. A 20,000-page before/after once came back with 18,720 of 18,721 pages byte-identical
because both runs read the same five-hour-old copy, while the same pages fetched fresh differed on
20 of 20. Measuring the edge cache tells you nothing about the content.

**Three pages is not a measurement.** Six deploys were once judged on three storefronts: reading
only `<main>` gave 28.4%, reading the whole page gave 58.1%, and neither was the number that
mattered. Use thousands of pairs, and check that independent samples agree before believing any of
it.

## Sampling

Group by `(categoryId, cityId)`, keep groups with enough members, take N from each. That yields
many same-category/same-city pairs — the case a search engine actually has to choose between —
plus a control of cross-category pairs. Ordering groups by `md5(...)` with a seed makes a run
reproducible and lets independent batches be drawn.

Batches drawn this way agreed at 17.9 / 18.3 / 17.9% median, so the measurement is stable even
though the number itself is uncomfortable.
