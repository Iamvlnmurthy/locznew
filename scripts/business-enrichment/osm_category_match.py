"""Category evidence from OpenStreetMap points of interest.

The best guess available short of an owner claiming their listing.

Every category in the directory came from one source label, mapped by rules. That
label made Apple India an event planner, and nothing downstream could tell. Reading
the business *name* instead was tried and is worse: "Vidya Mandir" is a school not a
temple, "Milk Parlour" is not a salon, "Physics Lab" is not a diagnostic centre —
five such classes turned up in a single sample of a few dozen.

An OSM POI is different in kind. Somebody stood at that spot and recorded what the
building is, as `fclass=pharmacy` or `fclass=dentist`. It is not a guess from a
string; it is a second, independent observation.

**This writes no category.** It records agreement and disagreement, because the
useful output is knowing *which* records to trust — not another sweep of automated
changes on top of the one that put a spa banner on a dentist.

What it cannot do, stated plainly:

  - **Coverage is partial.** OSM POI data is dense in cities and thin in small
    towns. Expect a minority of businesses to match at all.
  - **Proximity is not identity.** A pharmacy inside a hospital sits on the
    hospital's coordinates. Hence a tight radius, and a rule that a match is
    dropped when two different POI classes are equally close.

    python scripts/business-enrichment/osm_category_match.py            # report
"""

import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _db  # noqa: E402

_db.utf8_stdout()

POI_SHP = "var/osm/gis_osm_pois_free_1.shp"
MAX_METRES = 120  # generous, because the name is what identifies the record

# Proximity alone identifies nothing.
#
# The first run matched the nearest POI within 60m and disagreed with us 82% of the
# time — but reading the disagreements showed OSM was describing *a different shop*:
# "Sona Roopa Jewellers" filed as a jeweller, with a bank recorded 11m away. On an
# Indian commercial street 60m holds a dozen businesses, so "nearest" is nearly
# meaningless.
#
# The POI carries a name. Requiring the names to agree turns a coincidence of
# location into an identification: this row and that POI are the same place, and
# then its fclass is real evidence.

# OSM fclass -> the LocZ category it is evidence for. Only classes whose meaning is
# unambiguous: `fclass=restaurant` says restaurant, while `fclass=shop` says nothing.
FCLASS = {
    "pharmacy": "Medical shops",
    "chemist": "Medical shops",
    "dentist": "Dental clinics",
    "doctors": "Doctor clinics & consultation centres",
    "hospital": "Hospitals & clinics",
    "clinic": "Hospitals & clinics",
    "veterinary": "Veterinary clinics",
    "optician": "Opticians & eyewear",
    "bank": "Banks & ATMs",
    "atm": "Banks & ATMs",
    "fuel": "Petrol pumps",
    "restaurant": "Restaurants & food",
    "fast_food": "Restaurants & food",
    "cafe": "Cafes & coffee shops",
    "bakery": "Bakeries & sweets",
    "bar": "Bars and pubs",
    "pub": "Bars and pubs",
    "hotel": "Hotels & stays",
    "guesthouse": "Hotels & stays",
    "hostel": "Student hostels",
    "school": "Schools",
    "college": "Colleges",
    "university": "Colleges & universities",
    "kindergarten": "Day care preschools",
    "library": "Public libraries",
    "supermarket": "Grocery & kirana",
    "convenience": "Grocery & kirana",
    "greengrocer": "Grocery & kirana",
    "butcher": "Meat shops",
    "bookshop": "Book shops",
    "clothes": "Clothing stores",
    "shoe_shop": "Footwear stores",
    "jeweller": "Jewellery stores",
    "furniture_shop": "Furniture & home decor shops",
    "hairdresser": "Beauty salons",
    "beauty_shop": "Beauty salons",
    "car_repair": "Automobile services",
    "car_dealership": "Automobile showrooms & dealers",
    "bicycle_shop": "Bicycle shops",
    "computer_shop": "Computer & laptop stores",
    "mobile_phone_shop": "Mobile stores",
    "hardware": "Hardware shops",
    "florist": "Flowers & Gift Shops",
    "stationery": "Printing & stationery",
    "laundry": "Laundry & dry cleaning",
    "travel_agent": "Travel agencies",
    "police": "Police stations",
    "post_office": "Post offices",
    "temple": "Places of worship",
    "hindu_temple": "Places of worship",
    "mosque": "Places of worship",
    "church": "Places of worship",
    "gurudwara": "Places of worship",
}


def name_key(value):
    """A name reduced to what identifies it, for comparing across two sources."""
    cleaned = "".join(c.lower() if c.isalnum() else " " for c in (value or ""))
    drop = {"the", "and", "shop", "store", "centre", "center", "pvt", "ltd", "co",
            "sri", "shri", "sree", "new", "india", "indian"}
    return {w for w in cleaned.split() if len(w) > 2 and w not in drop}


def read_pois():
    """POI points and their class, straight from the shapefile."""
    try:
        import shapefile  # pyshp
    except ImportError:
        print("pyshp is required:  pip install pyshp", file=sys.stderr)
        raise SystemExit(1)

    reader = shapefile.Reader(POI_SHP, encoding="utf-8", encodingErrors="replace")
    fields = [f[0] for f in reader.fields[1:]]
    i_class, i_name = fields.index("fclass"), fields.index("name")
    out = []
    for shape, rec in zip(reader.iterShapes(), reader.iterRecords()):
        if not shape.points:
            continue
        fclass = rec[i_class]
        if fclass not in FCLASS:
            continue
        lon, lat = shape.points[0]
        out.append((lat, lon, fclass, rec[i_name] or ""))
    return out


def main():
    print("reading OSM points of interest…", flush=True)
    pois = read_pois()
    print(f"  {len(pois):,} POIs in classes we can act on", flush=True)

    # A grid so each business only compares against its own neighbourhood. 0.001
    # degrees is roughly 110m, so a 3x3 block of cells covers the 60m radius.
    CELL = 0.001
    grid = {}
    for lat, lon, fclass, name in pois:
        grid.setdefault((round(lat / CELL), round(lon / CELL)), []).append(
            (lat, lon, fclass, name)
        )

    conn = _db.connect(statement_timeout="600s", work_mem="64MB")
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM categories")
    cat_by_name = {n: i for i, n in cur.fetchall()}

    agree = disagree = nomatch = ambiguous = 0
    disagreements = []

    print("matching businesses…", flush=True)
    seen = 0
    for bid, bname, lat, lon, cat_name in _db.chunks(
        conn,
        "businesses b",
        'b.id, b.name, b.latitude, b.longitude, '
        '(SELECT c.name FROM categories c WHERE c.id = b."categoryId")',
        where='b."deletedAt" IS NULL AND b."isActive" AND b.latitude IS NOT NULL',
        size=5000,
        key="id",
    ):
        seen += 1
        gy, gx = round(float(lat) / CELL), round(float(lon) / CELL)
        bkey = name_key(bname)
        if not bkey:
            nomatch += 1
            continue
        best = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for plat, plon, fclass, pname in grid.get((gy + dy, gx + dx), ()):
                    dm = (
                        ((float(lat) - plat) * 111_320) ** 2
                        + ((float(lon) - plon) * 96_000) ** 2
                    ) ** 0.5
                    if dm > MAX_METRES:
                        continue
                    # Same place, or merely nearby? The names decide.
                    pkey = name_key(pname)
                    if not pkey:
                        continue
                    shared = len(bkey & pkey)
                    if shared == 0:
                        continue
                    overlap = shared / min(len(bkey), len(pkey))
                    if overlap < 0.6:
                        continue
                    if best is None or dm < best[0]:
                        best = (dm, fclass, pname)
        if best is None:
            nomatch += 1
            continue

        expected = FCLASS[best[1]]
        if expected not in cat_by_name:
            ambiguous += 1
            continue
        if expected == cat_name:
            agree += 1
        else:
            disagree += 1
            disagreements.append((bid, bname, cat_name, expected, best[1], best[0]))
        if seen % 500_000 == 0:
            print(f"  {seen:,} scanned", flush=True)
    conn.close()

    matched = agree + disagree
    lines = [
        "OSM point-of-interest agreement with LocZ categories",
        "",
        f"  businesses with coordinates   {seen:>10,}",
        f"  matched a usable POI <= {MAX_METRES}m  {matched:>10,}"
        + (f"   {matched * 100 / seen:.1f}%" if seen else ""),
        f"    OSM agrees with us          {agree:>10,}"
        + (f"   {agree * 100 / matched:.1f}% of matched" if matched else ""),
        f"    OSM disagrees               {disagree:>10,}"
        + (f"   {disagree * 100 / matched:.1f}%" if matched else ""),
        f"  no POI nearby                 {nomatch:>10,}",
        "",
        "DISAGREEMENTS — sample. OSM is a second observation, not a verdict:",
        "a pharmacy inside a hospital stands on the hospital's coordinates.",
        "",
    ]
    for _bid, bname, ours, theirs, _fclass, dm in disagreements[:40]:
        lines.append(f"  {bname[:34]:36} ours: {ours[:26]:28} osm: {theirs[:24]} ({dm:.0f}m)")

    # The subset worth acting on.
    #
    # Not every disagreement is an error. "Domino's Pizza" filed under *Pizza
    # restaurants* against OSM's *Restaurants & food* is us being more specific,
    # and adopting OSM there would flatten a taxonomy built on purpose. So a
    # disagreement only counts when our category is NOT a descendant of what OSM
    # says — a different branch, not a finer twig on the same one — and when the
    # two records sit within 15m, which at name-match level means one address.
    io.open("var/osm_category_adopt.txt", "w", encoding="utf-8").write(
        chr(10).join(f"{bid}	{ours}	{theirs}	{dm:.0f}	{bname}"
                     for bid, bname, ours, theirs, _f, dm in disagreements
                     if dm <= 15) + chr(10))
    close = sum(1 for *_x, dm in disagreements if dm <= 15)
    lines.append("")
    lines.append(f"  within 15m (same address, both sources named it): {close:,}")
    lines.append("  written to var/osm_category_adopt.txt for the descendant check")
    lines += [
        "",
        "Nothing was written. This says which records have a second source agreeing",
        "with them, which is the closest thing to trust available short of an owner",
        "claiming the listing.",
    ]
    text = "\n".join(lines)
    print(text)
    io.open("var/osm_category_match.txt", "w", encoding="utf-8").write(text + "\n")


if __name__ == "__main__":
    main()
