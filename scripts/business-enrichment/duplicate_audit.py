"""Probable duplicate businesses — a report, not a merge.

4.2 million records assembled from a bulk import and two enrichment passes will
contain the same shop twice. The question this answers is how often, and how
confidently, so that a decision about merging can be taken with numbers rather
than with an impression.

**It changes nothing.** No row is merged, redirected or deleted. Merging the wrong
pair destroys a real business's page and its inbound links, and a confident-looking
score is not the same as being right — so the output is a list to read, with the
uncertain cases separated from the obvious ones.

How candidates are found, and why this way:

    normalised name  +  ~110m grid cell

Comparing every business to every other is 8.8 trillion pairs. Grouping by a
normalised name inside a coordinate cell finds the pairs worth scoring in a single
pass, at the cost of missing duplicates whose names differ in more than
punctuation. That trade is deliberate: this is a floor on the duplicate count, not
a ceiling, and a floor is enough to decide whether the problem is worth more work.

    python scripts/business-enrichment/duplicate_audit.py
"""

import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _db  # noqa: E402

_db.utf8_stdout()

# Words that carry no identity. "Sri Krishna Medicals" and "Krishna Medical Store"
# are plausibly the same shop; the difference is entirely in words like these.
NOISE = {
    "the", "and", "shop", "shops", "store", "stores", "centre", "center",
    "pvt", "ltd", "private", "limited", "co", "company", "inc",
    "sri", "shri", "sree", "m/s", "messrs",
}


def normalise(name):
    """A name reduced to the words that identify it."""
    cleaned = "".join(c.lower() if c.isalnum() else " " for c in (name or ""))
    words = [w for w in cleaned.split() if w and w not in NOISE]
    # Sorted, so "Krishna Medicals" and "Medicals Krishna" collapse together.
    return " ".join(sorted(words))


SQL = """
WITH candidate AS (
  SELECT
    b.id,
    b.name,
    b.slug,
    b."primaryPhone",
    b.website,
    b."categoryId",
    b.latitude,
    b.longitude,
    -- ~110m at the equator, less as you go north. Coarse on purpose: two records
    -- of one shop rarely sit more than a few tens of metres apart, and a tighter
    -- cell splits them across a boundary as often as it separates two real shops.
    round(b.latitude::numeric, 3) AS cell_lat,
    round(b.longitude::numeric, 3) AS cell_lon
  FROM businesses b
  WHERE b."deletedAt" IS NULL
    AND b."isActive"
    AND b.latitude IS NOT NULL
    AND char_length(btrim(b.name)) > 3
)
SELECT cell_lat, cell_lon, id, name, slug, "primaryPhone", website, "categoryId",
       latitude, longitude
FROM candidate
ORDER BY cell_lat, cell_lon
"""


def score(a, b):
    """How confident we are that these two records are one business.

    Weighted by how hard each signal is to share by coincidence. Two unrelated
    shops on one street can share a category trivially; sharing a phone number is
    close to conclusive, and sharing a website domain nearly so.
    """
    points = 0.55  # the shared normalised name and cell that got them here
    why = ["name+location"]

    pa, pb = (a["phone"] or "").strip(), (b["phone"] or "").strip()
    if pa and pa == pb:
        points += 0.30
        why.append("same phone")
    elif pa and pb and pa != pb:
        # Two different working numbers is real evidence *against*: a duplicated
        # import copies the phone, it does not invent a second one.
        points -= 0.20
        why.append("different phones")

    da, db_ = domain(a["website"]), domain(b["website"])
    if da and da == db_:
        points += 0.15
        why.append("same domain")

    if a["categoryId"] == b["categoryId"]:
        points += 0.05
        why.append("same category")
    else:
        points -= 0.10
        why.append("different category")

    metres = rough_metres(a, b)
    if metres is not None and metres < 25:
        points += 0.10
        why.append(f"{metres:.0f}m apart")
    elif metres is not None:
        why.append(f"{metres:.0f}m apart")

    return max(0.0, min(points, 0.99)), ", ".join(why)


def domain(url):
    if not url:
        return None
    value = url.lower().split("//")[-1].split("/")[0]
    return value[4:] if value.startswith("www.") else value or None


def rough_metres(a, b):
    """Good enough for a few hundred metres; this is not navigation."""
    try:
        dlat = (float(a["lat"]) - float(b["lat"])) * 111_320
        dlon = (float(a["lon"]) - float(b["lon"])) * 96_000  # ~cos(30°) for India
        return (dlat * dlat + dlon * dlon) ** 0.5
    except (TypeError, ValueError):
        return None


def main():
    conn = _db.connect(statement_timeout="600s", work_mem="64MB")
    print("scanning; grouping by normalised name inside ~110m cells", flush=True)

    pairs = []
    total = 0
    with conn.cursor(name="dupscan") as cur:  # server-side cursor: never loads 4.2M at once
        cur.itersize = 20_000
        cur.execute(SQL)
        cell = None
        bucket = {}

        def flush(bucket):
            for _, rows in bucket.items():
                if len(rows) < 2:
                    continue
                for i in range(len(rows)):
                    for j in range(i + 1, len(rows)):
                        p, why = score(rows[i], rows[j])
                        if p >= 0.5:
                            pairs.append((p, rows[i], rows[j], why))

        for row in cur:
            total += 1
            key = (row[0], row[1])
            if key != cell:
                flush(bucket)
                bucket = {}
                cell = key
            rec = {
                "id": row[2], "name": row[3], "slug": row[4], "phone": row[5],
                "website": row[6], "categoryId": row[7], "lat": row[8], "lon": row[9],
            }
            bucket.setdefault(normalise(rec["name"]), []).append(rec)
            if total % 500_000 == 0:
                print(f"  {total:,} scanned, {len(pairs):,} pairs so far", flush=True)
        flush(bucket)
    conn.close()

    bands = {"0.90+ near certain": 0, "0.75-0.89 likely": 0, "0.50-0.74 uncertain": 0}
    for p, *_ in pairs:
        if p >= 0.90:
            bands["0.90+ near certain"] += 1
        elif p >= 0.75:
            bands["0.75-0.89 likely"] += 1
        else:
            bands["0.50-0.74 uncertain"] += 1

    out = []
    w = out.append
    w(f"scanned {total:,} businesses")
    w(f"probable duplicate pairs: {len(pairs):,}"
      + (f"  ({len(pairs) * 100 / total:.2f}% of records)" if total else ""))
    w("")
    for band in ("0.90+ near certain", "0.75-0.89 likely", "0.50-0.74 uncertain"):
        w(f"  {band:24} {bands[band]:>8,}")
    w("")
    w("EXAMPLES — read these before deciding anything")
    for p, a, b, why in sorted(pairs, key=lambda x: -x[0])[:25]:
        w(f"  {p:.2f}  {a['name'][:38]:40} | {b['name'][:38]:40}  ({why})")
        w(f"        /b/{a['slug']}")
        w(f"        /b/{b['slug']}")
    w("")
    w("Nothing was merged, redirected or deleted. This finds pairs whose names")
    w("differ only in punctuation and noise words, so it is a floor on the true")
    w("count, not a ceiling.")

    text = "\n".join(out)
    print(text)
    io.open("var/duplicate_audit.txt", "w", encoding="utf-8").write(text + "\n")
    print("\nwritten to var/duplicate_audit.txt")

    # The whole near-certain band, written out for review. Twenty-five examples show
    # the shape of the problem and are not enough to decide anything: a merge
    # redirects a real page away permanently, so whoever decides needs the list.
    near = sorted([x for x in pairs if x[0] >= 0.90], key=lambda x: -x[0])
    review = ['# Near-certain duplicate pairs (>= 0.90)',
              '#',
              '# Read before merging anything. A wrong call costs a real business',
              '# its listing and every link pointing at it.',
              f'# {len(near):,} pairs', '']
    for prob, a, b, why in near:
        review.append(f'{prob:.2f}  {why}')
        review.append(f"  A  {a['name']}")
        review.append(f"     https://locz.in/b/{a['slug']}   phone={a['phone'] or '-'}")
        review.append(f"  B  {b['name']}")
        review.append(f"     https://locz.in/b/{b['slug']}   phone={b['phone'] or '-'}")
        review.append('')
    io.open('var/duplicate_review.txt', 'w', encoding='utf-8').write(chr(10).join(review))
    print(f'near-certain pairs written to var/duplicate_review.txt ({len(near):,})')


if __name__ == "__main__":
    main()
