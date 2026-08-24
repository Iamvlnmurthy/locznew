"""Import city profiles + guide sections from locz_cities.db into the prod city_content /
city_sections tables. Maps each local city to a prod `cities` row by slug, then by name, then
by a small alias map for the handful whose slugs differ (Allahabad/Prayagraj etc.).

Run on the VPS where prod is local:  SRC=/tmp/locz_cities.db python3 import_to_prod.py apply
"""
import os, sqlite3, sys, uuid, psycopg

SRC = os.environ.get("SRC", "locz_cities.db")
DRY = "apply" not in sys.argv
PROD_URL = open("/tmp/locz_dburl").read().strip()

# City slugs that differ between the content DB (city names) and prod (often district names).
ALIAS = {
    "prayagraj": "allahabad", "allahabad": "prayagraj",
    "delhi": "new-delhi", "gurugram": "gurgaon", "bokaro-steel-city": "bokaro",
    "hubballi-dharwad": "dharwad", "puducherry": "pondicherry", "kanpur": "kanpur-nagar",
}

PROFILE = {
    "shortIntro": "short_introduction", "description": "detailed_description",
    "famousFor": "what_city_is_famous_for", "character": "city_character",
    "economySummary": "economy_summary", "climate": "climate_classification",
    "knownFor": "known_for_summary", "seoTitle": "seo_title",
    "metaDescription": "meta_description", "sourceName": "source_organisation",
    "dataQuality": "data_quality_grade",
}
LIMITS = {"famousFor": 500, "knownFor": 500, "climate": 120, "seoTitle": 200,
          "metaDescription": 400, "sourceName": 160, "dataQuality": 20}


def clip(key, val):
    if val is None:
        return None
    v = str(val).strip()
    if not v or v.upper().startswith("VERIFY"):  # skip pipeline "VERIFY before publishing" stubs
        return None
    lim = LIMITS.get(key)
    return v[:lim] if lim else v


def main():
    src = sqlite3.connect(SRC)
    src.row_factory = sqlite3.Row
    prod = psycopg.connect(PROD_URL, connect_timeout=60)

    # prod slug/name -> id
    by_slug, by_name = {}, {}
    for cid, slug, name in prod.execute('SELECT id, slug, lower(name) FROM cities').fetchall():
        by_slug[slug] = cid
        by_name.setdefault(name, cid)

    cities = [dict(r) for r in src.execute("SELECT * FROM cities")]
    imported = missed = sect_n = 0
    for c in cities:
        pid = (by_slug.get(c["city_slug"]) or by_name.get((c["city_name"] or "").lower())
               or by_slug.get(ALIAS.get(c["city_slug"], "")))
        if not pid:
            print(f"  MISS  {c['city_name']} ({c['city_slug']})", flush=True); missed += 1; continue

        cols = {k: clip(k, c.get(v)) for k, v in PROFILE.items()}
        secs = [dict(r) for r in src.execute(
            "SELECT section_key,title,content,source_url,license,source FROM city_sections WHERE city_id=?",
            (c["id"],))]

        if not DRY:
            with prod.cursor() as cur:
                fields = list(cols.keys())
                cur.execute(
                    f'INSERT INTO city_content ("cityId",{",".join(chr(34)+f+chr(34) for f in fields)},"updatedAt") '
                    f'VALUES (%s,{",".join(["%s"]*len(fields))},now()) '
                    f'ON CONFLICT ("cityId") DO UPDATE SET '
                    + ",".join(f'"{f}"=EXCLUDED."{f}"' for f in fields) + ',"updatedAt"=now()',
                    [pid, *[cols[f] for f in fields]])
                for i, s in enumerate(secs):
                    cur.execute(
                        'INSERT INTO city_sections ("id","cityId","sectionKey","title","content","sourceUrl","license","source","sortOrder") '
                        'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) '
                        'ON CONFLICT ("cityId","sectionKey") DO UPDATE SET '
                        '"title"=EXCLUDED."title","content"=EXCLUDED."content","sourceUrl"=EXCLUDED."sourceUrl",'
                        '"license"=EXCLUDED."license","source"=EXCLUDED."source","sortOrder"=EXCLUDED."sortOrder"',
                        [str(uuid.uuid4()), pid, s["section_key"], s["title"], s["content"],
                         s["source_url"], s["license"], s["source"], i])
            prod.commit()
        imported += 1
        sect_n += len(secs)
        if DRY and imported >= 3:
            print(f"  DRY sample: {c['city_name']} -> {len(secs)} sections, intro={bool(cols['shortIntro'])}")
            break
    print(f"\nImported {imported} cities, {sect_n} sections, {missed} unmatched.")


main()
