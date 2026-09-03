"""How similar are two LocZ storefronts, measured across a real sample.

Every decision today was judged on three pages, which is not a measurement -- it hid that the
nearby-card grid dominated the duplication, and it let three consecutive changes look like they
did nothing when one of them was actively harmful. This fetches a stratified thousand and reports
the distribution instead of an anecdote.

The sample is built so the hard case is well represented: 50 categories x 5 cities x 4 businesses,
which yields 1,500 pairs that share both a category and a city. Those are the pages a search engine
is deciding between, so their overlap is the number that matters; cross-category pairs are measured
too, as the control.
"""
import concurrent.futures as cf
import io
import itertools
import json
import random
import statistics
import sys
import urllib.request

import pagetext

UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
SAMPLE = sys.argv[1] if len(sys.argv) > 1 else "sample.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "crosscheck_result.json"


def fetch(slug):
    # A cache-busting parameter, because the bare URL is served from Cloudflare's edge cache and
    # that cache is not purged on deploy. A 20,000-page before/after came back with 18,720 of
    # 18,721 pages byte-identical -- both runs had read the same five-hour-old copy, while the
    # same pages fetched fresh differed on 20 of 20. Measuring the cache tells you nothing about
    # the content. (What Googlebot receives is the cached copy, which is a delivery problem to fix
    # separately, not a reason to measure stale HTML.)
    url = f"https://locz.in/b/{slug}?mc={random.randint(1, 10**9)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return slug, pagetext.page_text(r.read().decode("utf-8", "ignore"))
    except Exception:
        return slug, None


sample = json.load(io.open(SAMPLE, encoding="utf-8"))
texts = {}
done = 0
with cf.ThreadPoolExecutor(max_workers=12) as pool:
    for slug, text in pool.map(fetch, [s["slug"] for s in sample]):
        done += 1
        if text and len(text.split()) > 80:
            texts[slug] = text
        if done % 100 == 0:
            print(f"  fetched {done}/{len(sample)}  usable={len(texts)}", flush=True)

print(f"fetched {done}, usable {len(texts)}", flush=True)
json.dump(texts, io.open(OUT.replace(".json", "_texts.json"), "w", encoding="utf-8"))

# Strip the site's own furniture, measured rather than listed.
#
# A first run put unrelated pages at 50.7% similar, which is not a fact about the content -- it is
# the header, footer, buttons, form labels and legal block that every storefront carries. A search
# engine discounts that boilerplate, so a measurement that counts it cannot tell a good page from a
# bad one. Any five-word sequence appearing on more than 60% of sampled pages is furniture by
# definition, so remove it from every page before comparing what is left.
counts = {}
page_shingles = {slug: pagetext.shingles(t) for slug, t in texts.items()}
for sh in page_shingles.values():
    for g in sh:
        counts[g] = counts.get(g, 0) + 1
threshold = 0.6 * len(page_shingles)
CHROME = {g for g, c in counts.items() if c >= threshold}
print(f"site furniture: {len(CHROME)} shared 5-grams removed "
      f"(present on >=60% of {len(page_shingles)} pages)", flush=True)
CONTENT = {slug: (sh - CHROME) for slug, sh in page_shingles.items()}


def overlap_content(a, b):
    A, B = CONTENT.get(a, set()), CONTENT.get(b, set())
    if not A or not B:
        return 0.0
    return 100.0 * len(A & B) / min(len(A), len(B))


by_group = {}
for s in sample:
    if s["slug"] in texts:
        by_group.setdefault((s["cat"], s["city"]), []).append(s["slug"])

same_cat = []
for (cat, city), slugs in by_group.items():
    for a, b in itertools.combinations(slugs, 2):
        same_cat.append((cat, city, a, b, overlap_content(a, b)))

# Control: pairs from different categories, sampled to a comparable count.
all_slugs = list(texts)
cat_of = {s["slug"]: s["cat"] for s in sample}
random.seed(7)
cross = []
while len(cross) < 800 and len(all_slugs) > 1:
    a, b = random.sample(all_slugs, 2)
    if cat_of[a] != cat_of[b]:
        cross.append(overlap_content(a, b))


def describe(values):
    if not values:
        return None
    v = sorted(values)
    return {
        "n": len(v),
        "median": round(statistics.median(v), 1),
        "mean": round(statistics.fmean(v), 1),
        "p90": round(v[int(0.9 * (len(v) - 1))], 1),
        "max": round(v[-1], 1),
        "over_30pct": round(100.0 * sum(1 for x in v if x >= 30) / len(v), 1),
    }


same_vals = [x[4] for x in same_cat]
result = {
    "pages_measured": len(texts),
    "same_category_same_city": describe(same_vals),
    "different_category": describe(cross),
    "worst_pairs": [
        {"category": c, "city": ci, "a": a, "b": b, "overlap": round(o, 1)}
        for c, ci, a, b, o in sorted(same_cat, key=lambda x: -x[4])[:10]
    ],
    "worst_categories": sorted(
        (
            {
                "category": cat,
                "pairs": len(v),
                "median": round(statistics.median(v), 1),
            }
            for cat, v in (
                (cat, [x[4] for x in same_cat if x[0] == cat])
                for cat in {x[0] for x in same_cat}
            )
            if v
        ),
        key=lambda d: -d["median"],
    )[:10],
}
json.dump(result, io.open(OUT, "w", encoding="utf-8"), indent=1)

print()
print("SAME CATEGORY + SAME CITY   ", result["same_category_same_city"])
print("DIFFERENT CATEGORY (control)", result["different_category"])
print()
print("worst categories by median overlap:")
for w in result["worst_categories"][:6]:
    print("  %-34s %5.1f%%  (%d pairs)" % (w["category"], w["median"], w["pairs"]))
