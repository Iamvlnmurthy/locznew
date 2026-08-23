"""Entity quality and indexability scoring — as a report, never as an action.

Two separate numbers, because they answer different questions:

  entity_quality_score  how completely do we describe this place?
  indexability_score    is this page worth a search engine's time?

They are not the same. A tiny shop with a name, coordinates, an address and a
phone number is a perfectly good page and a thin entity. A record with fifteen
populated columns and no coordinates cannot be placed on a map and is worth less
than the shop.

**This script only reports.** It writes no robots directive and changes no row.
Turning a score into a `noindex` across millions of live URLs is a decision to
take with the numbers in hand, not a side effect of computing them — which is
also what the spec that prompted this asked for.

    python scripts/business-enrichment/quality_audit.py            # sample, fast
    python scripts/business-enrichment/quality_audit.py --full     # every row

Reads in keyset chunks through _db.py, so it never sorts or scans the whole
table. An unbounded ad-hoc query took this database into crash recovery once
already.
"""

import io
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _db  # noqa: E402

_db.utf8_stdout()

FULL = "--full" in sys.argv
SAMPLE_LIMIT = 200_000

# Weights, deliberately unequal.
#
# Identity and location carry the page: without a name and coordinates there is
# nothing to show and nowhere to put it. Contact details are what a reader came
# for. Everything else is texture. Counting fields equally would rate a business
# with five social links above one with an address, which is backwards.
WEIGHTS = {
    "name": 15,        # a real name, not "Unnamed" or two characters
    "coords": 20,      # without this it cannot be mapped, found nearby, or ranked locally
    "city": 10,
    "locality": 12,    # the most specific thing most pages can say about where
    "street": 12,
    "pincode": 6,
    "phone": 12,       # the single most-used action on a directory page
    "website": 4,
    "email": 2,
    "landmark": 4,     # "near X" is often how people actually navigate here
    "category_specific": 3,   # filed under a subcategory rather than a bare parent
}

JUNK = ("unnamed", "unknown", "n/a", "null", "test", "anganwadi", "panchayat",
        "sub centre", "sub-centre", "fair price", "ration shop")


def score_row(r):
    (name, lat, lon, city, locality, street, pincode, phone,
     website, email, landmark, parent_id, kw) = r

    got = {
        "name": bool(name) and len(name.strip()) > 2
                and not any(name.strip().lower().startswith(j) for j in JUNK),
        "coords": lat is not None and lon is not None,
        "city": bool(city),
        "locality": bool(locality),
        "street": bool(street),
        "pincode": bool(pincode),
        "phone": bool(phone),
        "website": bool(website),
        "email": bool(email),
        "landmark": bool(landmark),
        "category_specific": parent_id is not None,
    }
    quality = sum(w for k, w in WEIGHTS.items() if got[k])

    # Indexability is a different question, so it is not a rescaling of quality.
    #
    # A page earns indexing by being about a findable, identifiable place. The
    # gates below are absolute: a page failing any of them has nothing a searcher
    # could have been looking for, however many other columns are populated.
    if not got["name"] or not got["coords"] or not got["city"]:
        index = 0
    else:
        index = 45  # identifiable and placeable — the floor for a real page
        if got["locality"]:
            index += 15   # answers "where exactly", which city alone does not
        if got["street"]:
            index += 12
        if got["phone"]:
            index += 15   # a page you can act on
        if got["landmark"]:
            index += 5
        if got["website"]:
            index += 5
        if got["pincode"]:
            index += 3
        index = min(index, 100)
    return quality, index, got


def band(score):
    if score >= 80:
        return "80-100 strong"
    if score >= 60:
        return "60-79  good"
    if score >= 40:
        return "40-59  thin"
    if score >= 20:
        return "20-39  weak"
    return "0-19   bare"


SQL_COLUMNS = """b.name, b.latitude, b.longitude, ci.name, l.name, a.line1,
    b."pincodeCode", b."primaryPhone", b.website, b.email, a.landmark,
    c."parentId", cardinality(b.keywords)"""


def main():
    conn = _db.connect(statement_timeout="300s", work_mem="32MB")
    q_bands, i_bands = {}, {}
    field_counts = {k: 0 for k in WEIGHTS}
    total = 0
    weak_examples = []

    # Keyset paging over businesses, joining only what scoring needs.
    last = None
    size = 5000
    while True:
        sql = f"""
            SELECT b.id, {SQL_COLUMNS}
            FROM businesses b
            JOIN categories c ON c.id = b."categoryId"
            JOIN cities ci ON ci.id = b."cityId"
            LEFT JOIN addresses a ON a.id = b."addressId"
            LEFT JOIN localities l ON l.id = a."localityId"
            WHERE b."deletedAt" IS NULL AND b."isActive"
              {'AND b.id > %s' if last else ''}
            ORDER BY b.id
            LIMIT {size}"""
        with conn.cursor() as cur:
            cur.execute(sql, (last,) if last else ())
            rows = cur.fetchall()
        if not rows:
            break
        for row in rows:
            bid, rest = row[0], row[1:]
            quality, index, got = score_row(rest)
            total += 1
            q_bands[band(quality)] = q_bands.get(band(quality), 0) + 1
            i_bands[band(index)] = i_bands.get(band(index), 0) + 1
            for k, v in got.items():
                if v:
                    field_counts[k] += 1
            if index < 40 and len(weak_examples) < 15:
                weak_examples.append((rest[0], index, quality))
        last = rows[-1][0]
        if not FULL and total >= SAMPLE_LIMIT:
            break
        if total % 100_000 == 0:
            print(f"  scored {total:,}", flush=True)
    conn.close()

    out = []
    w = out.append
    w(f"scored {total:,} businesses"
      + ("" if FULL else f" (sample of the first {SAMPLE_LIMIT:,} by id)"))
    w("")
    w("ENTITY QUALITY — how completely we describe the place")
    for b in sorted(q_bands, reverse=True):
        w(f"  {b:16} {q_bands[b]:>9,}  {q_bands[b] * 100 / total:5.1f}%")
    w("")
    w("INDEXABILITY — whether the page is worth a crawl")
    for b in sorted(i_bands, reverse=True):
        w(f"  {b:16} {i_bands[b]:>9,}  {i_bands[b] * 100 / total:5.1f}%")
    w("")
    w("FIELD COVERAGE")
    for k in sorted(field_counts, key=lambda x: -field_counts[x]):
        w(f"  {k:18} {field_counts[k]:>9,}  {field_counts[k] * 100 / total:5.1f}%")
    if weak_examples:
        w("")
        w("WEAKEST PAGES — examples, for judging whether the score is fair")
        for name, idx, qual in weak_examples[:10]:
            w(f"  index {idx:>3}  quality {qual:>3}  {name}")
    w("")
    w("No row was modified and no robots directive was written. Deciding what to")
    w("do about the low bands is a separate decision, to be taken with these")
    w("numbers in hand.")

    text = "\n".join(out)
    print(text)
    io.open("var/quality_audit.txt", "w", encoding="utf-8").write(text + "\n")
    print("\nwritten to var/quality_audit.txt")


if __name__ == "__main__":
    main()
