# Business data enrichment — what was done, and how to do it again

A working log of the 22–23 August 2026 enrichment, written so the work can be understood,
repeated or undone on another machine. Read this before running anything in
`scripts/business-enrichment/`.

Starting point: **3,414,974 businesses**, imported 3 August 2026. 400 of them had an address.
Five had a description. Every page ended with the same sentence: "Located in the NNNNNN area."

---

## 1. Where the data came from

Overture Maps is open data and downloadable directly, so nothing had to be transferred from
another machine.

```bash
# the release tag matters: old releases are pruned, so the tag in older docs 404s
curl -s "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/?list-type=2&delimiter=/&prefix=release/"
# -> 2026-08-19.0 was current
```

`var/overture/pull.py` extracts India places into `var/overture/india_places.parquet`
(5,003,976 rows, 414 MB, ~60s).

**A bounding box is not a country.** The extract uses `xmin BETWEEN 68 AND 97 AND ymin
BETWEEN 6 AND 37`, a rectangle covering Pakistan, Bangladesh, Sri Lanka and Nepal as well as
India: 699,821 of those 5M rows (14%) are not Indian. Overture states the country per record;
use that, never the rectangle. The existing directory is clean — 4 non-Indian records out of
2,705,867 — because the original import filtered properly.

## 2. How records were matched

87% of the directory already carries its Overture id in `sourceRecordId` as `ovt:<uuid>`, so
this is an exact join, not fuzzy matching.

|                                 | count     |
| ------------------------------- | --------- |
| matched by id                   | 2,705,867 |
| recovered by coordinates + name | 58,227    |
| no match                        | ~651,000  |

The fuzzy pass (`var/overture/fuzzy.py`) requires name similarity >= 0.92, distance <= 100m,
**and no second candidate that close** — otherwise a chain like "Bank of India" adopts the
neighbouring branch's phone number.

Written first as a range join (`BETWEEN` on a grid), it ran 90 minutes and 4.6 GB without
finishing. Rewritten as a 9-cell equi-join it takes **13 seconds**. If a spatial join here is
slow, this is why.

## 3. What was written

All of it additive: `COALESCE(existing, new)`, or gated on an empty column. No business's own
data was replaced, and a claimed business is never overruled.

| field                   | records         | source                                  |
| ----------------------- | --------------- | --------------------------------------- |
| street addresses        | 2,589,814       | Overture `addr_freeform`                |
| landmarks               | 1,666,958       | see below                               |
| keywords                | 2,369,082       | Overture taxonomy leaf                  |
| social profiles         | 2,323,728       | Overture `socials`                      |
| localities              | 571,260         | address text + single-locality pincodes |
| phone / website / email | 171K / 33K / 3K | only where the column was empty         |

**Landmarks come from two places.** 493,059 were transcribed from the source address
("...near X"). The rest are _computed_: the nearest navigational place 25–200m away, whose
own name says what it is ("Shri Thakurbari Temple" qualifies, "Balvatika Little Bees" does
not). Both render identically on the page. If that inference is unwanted, `ovt_nearby_lm`
records exactly which businesses got one.

## 4. The category tree

The import mapped source categories onto LocZ's 45 and got the tail wrong: every computer
training institute in India was filed under **Computer & laptop stores**, because the label
`computer_coaching` was read as a kind of computer shop. 612,623 businesses had no home at
all and sat in "Other local businesses".

All 1,423 business types that occur were reclassified into **69 parents and 1,375
subcategories** carrying 10,182 search phrases. 2,457,998 businesses were re-filed.

Three rules that matter:

1. **Never move a business into "Other local businesses."** The first attempt did this to
   194,486 businesses because the prompt offered "Other" as a fallback. A vague category is
   worse than an imperfect specific one.
2. **Never overrule an owner.** Only `ownerId IS NULL` rows are touched.
3. **Four labels are deliberately unnamed** — `shopping`, `services_and_business`,
   `commercial_industrial`, `b2b_service` are roots of the source taxonomy, not kinds of
   business. Calling 207,416 assorted shops "Shopping centres" would tell a reader they are
   all malls.

## 5. Language

Category, city, locality, keywords _and the sentence frame_ now change language together.

```
before   Grocery & kirana in Muzaffarpur. Located in the 842001 area.
after    ముజఫర్‌పుర్లో కిరాణా దుకాణాలు. ఆదర్శ విద్యా మందిర్ దగ్గర ఉంది.
```

Word order is the point: Telugu and Hindi both put the place _before_ the thing, and Hindi
ends with a danda. A translated preposition dropped into an English skeleton produces
fluent-looking nonsense.

Translated with Sarvam, every result validated to be in the target Unicode block before
writing: 640 cities, 1,404 keyword terms, 4,987 localities (the busiest 5,000 cover 79% of
pages), and the category names.

**A validator downstream of a hallucination is the wrong place to stand.** Asked to
transliterate the code `10TK`, the model returned "19 పుదూర్" — perfect Telugu, a place that
does not exist, and the script check accepted it. Names that do not look like names are no
longer sent at all.

## 6. Performance work (23 August)

Browsing took 3.9s. Three causes:

1. 530,385 dead tuples from the enrichment. `VACUUM (ANALYZE)`.
2. The default sort led with `listings._count` — computed per row, unindexable, and pointless
   because **no business has a listing**. When they do, this needs a counter column on
   `businesses`; sorting on a relation count at this scale will never be fast.
3. Every business shares one `createdAt`, so ordering by it sorted 3.4M identical values.

Indexes added, all `CONCURRENTLY`:

```
businesses_category_live_idx   (categoryId)                     WHERE deletedAt IS NULL AND isActive
businesses_browse_recent_idx   (createdAt DESC, id)             WHERE deletedAt IS NULL AND isActive
businesses_browse_popular_idx  (viewCount DESC, createdAt DESC) WHERE deletedAt IS NULL AND isActive
```

Result: **3.9s -> 0.29s**.

Also `count(b.*)` -> `count(*)` in the category counts query: counting the row forces a heap
read, which became a 3.5 GB scan once the tree grew from 45 categories to 1,581.

## 7. Two production faults fixed on the way

**`/dev/shm` was 64 MB** (Docker's default) on `locz-postgres`. Parallel query workers
overflowed it and threw `ERROR 53100`, giving intermittent 500s on `/businesses/nearby`.
Mitigated first by disabling parallel query (`max_parallel_workers_per_gather = 0`, no
restart needed), then fixed by recreating the container with `--shm-size=1g` and restoring
parallelism.

```bash
# the old container was renamed, not removed, so rollback is one command
docker rename locz-postgres locz-postgres-pre-shm
# data lives in the named volume locz-pgdata and survives either way
```

**The business sitemap served empty urlset documents.** Search Console reported "Missing XML
tag" and 0 discovered URLs on 177 shards. Two compounding causes:

- computing shard cursors walks 2.4M index entries and takes ~25s, and the result was cached
  **only in process memory** — so every deploy threw it away, and the next crawler request
  paid full cost, timed out, and the route fell back to an empty slug list;
- an empty slug list rendered as a well-formed sitemap declaring the shard to have no pages,
  which was then cached for a day.

Cursors are now persisted in `sitemap_shard_cursors`, and a failed load returns **503 with
Retry-After** rather than a valid-looking empty document.

## 8. Running it again

Everything is resumable: each loader marks rows `done` and can be stopped and restarted.

```bash
python var/overture/pull.py            # Overture India extract
python var/overture/export_biz.py      # the directory, for local joining
python var/overture/build_payload.py   # address/landmark/contact payload
python var/overture/load.py apply      # stage + apply
```

The loaders now run **inside the database** as procedures (`apply_ovt_addresses`,
`apply_ovt_keywords`, `apply_ovt_landmarks`, `apply_recategorisation`). That is not a
preference: as a Python client over an SSH tunnel, a dropped tunnel killed the run silently —
once so quietly that the wrapper reported "finished" having done nothing.

```sql
CALL apply_ovt_addresses(20000);   -- commits per batch, sleeps 0.2s between
```

**Run them one at a time.** Two writers on `businesses` deadlocked each other, and with
`SKIP LOCKED` a second session can also make the first exit early believing it is done —
which left 707,841 addresses unapplied and looking complete.

## 9. Not done, and why

- **872,729 new businesses** are ready to import (India-only, deduplicated, 96.6% with a
  street address). Not imported: it creates that many permanent public URLs, and crawl budget
  is already stretched — 2.6% of the existing 3.4M had been crawled after three weeks.
- **`/te` and `/hi` are in no sitemap.** Deliberate, for the same crawl-budget reason. The
  page-level hreflang already declares them.
- **`notFound()` returns HTTP 200** on `/b`, `/ad` and `/c` — a Next 16 behaviour, not
  specific to this app. Those pages are `noindex`, so it surfaces as soft 404s and no worse.
- **Landmark names are not transliterated**, so a Telugu page mixes scripts. Cities were 640
  names; landmarks are ~1.6M.
- **Locality coverage is ~25%** and will not easily go higher. Overture's `addr_locality` is
  city-level in India, and its division boundaries are administrative units — point-in-polygon
  returns "CMWSSB Division 63" and maps businesses in East Delhi to Rohini. Tested, rejected.

## 10. Commits

All on `master`, from `b4d1e37`:

```
a2cba6a  street addresses, landmarks, keywords and native-language names
8fdecf7  docs: document how production actually runs
02d0fc0  business lists speak the reader's language too
2de80d1  city and category hubs render in the reader's language
c762a00  descriptions read as Telugu and Hindi, not English with translated nouns
7f6e826  stop repeating "written from public listing data" under every description
f00a219  keyword terms render in the reader's language
755eb88  mobile: business profiles follow the app's language setting
36572b0  the about panel shows facts the page does not already state
8590983  neighbourhood names in the reader's script
a26d1cf  a real category tree, designed from what is actually in the directory
0ab2148  storefront desktop layout polish
d2945ef  the description was still printing English keywords
8abce0b  the page title follows the language's word order
c98f690  browsing the directory was taking three seconds
e123d5f  three defects in the storefront redesign
9636403  the back button and breadcrumb overlapped
```

## 11. OpenStreetMap, without installing Nominatim (23 August)

Nominatim needs ~100GB and neither machine had it. But Nominatim's answers come from OSM, and
Geofabrik publishes the two layers that matter already extracted — so the same data was used
directly, with local spatial joins, and only the results uploaded.

    gis_osm_places_free_1   156,133 places — 102K villages, 46K hamlets, 3K suburbs
    gis_osm_roads_free_1    148,697 named roads

Matched against every business still missing something:

|                           | matched | applied |
| ------------------------- | ------- | ------- |
| street name (within 300m) | 506,678 | all     |
| locality (within 800m)    | 205,536 | all     |

The two sources turned out to complement each other rather than compete. Overture's division
points are stronger in towns; OSM's place nodes are overwhelmingly villages and hamlets, so
they filled the rural records Overture had missed.

**Localities were capped at 800m, not the 1500m the match allowed.** 195,022 of the matches
sat between 800m and 1.5km, where the nearest village is often simply not the one the
business is in. Roads needed no such caution — nearly all matched within 100m.

Coverage after this, of 3,416,136 businesses:

| field       | count     | %    |
| ----------- | --------- | ---- |
| keywords    | 3,416,136 | 100% |
| address row | 3,066,344 | 90%  |
| street line | 2,743,244 | 80%  |
| phone       | 2,397,823 | 70%  |
| socials     | 2,324,534 | 68%  |
| locality    | 2,305,752 | 67%  |
| landmark    | 1,891,634 | 55%  |

Locality began the day at 19% and street at 65%.

What is still missing needs Nominatim proper — the mandal, and the ~40% of localities where
the coarser source returned a town name. `docs/NOMINATIM_PLAN.md` covers that, and opens by
arguing it may not be worth the 100GB.
