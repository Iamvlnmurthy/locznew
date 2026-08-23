"""Import new businesses from Overture into the directory.

Every row here becomes a permanent public URL, so the filters are deliberately strict and
this writes nothing without `apply`. Run the pilot first: `PILOT_CITY=<name> ... apply`.

What a row must have to be imported at all:
  * Overture says it is in India -- the extract's bounding box is a rectangle over Pakistan,
    Bangladesh, Sri Lanka and Nepal, so the box cannot be trusted for this;
  * a name, confidence >= 0.5, and a business type that is not a park or a river;
  * a phone or a street address, so the page has something on it;
  * no existing LocZ business with a similar name within 120m;
  * a six-digit pincode that resolves to a city we already have. Some records carry the
    literal string "<<not-applicable>>" as a postcode, and one carries 54000, which is Lahore.

Each import carries its attribution: CDLA requires it to travel with the data.
"""
import io, json, os, re, sys, time, unicodedata, uuid, duckdb, psycopg

URL = io.open(
    r"C:/Users/USER/AppData/Local/Temp/claude/c--Users-USER--gemini-antigravity-scratch-locz/3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
).read().strip()
DRY = "apply" not in sys.argv
PILOT_CITY = os.environ.get("PILOT_CITY")
LIMIT = int(os.environ.get("IMPORT_LIMIT", "0"))

ATTRIBUTION = "Details from Overture Maps, licensed under CDLA-Permissive-2.0."
SOURCE_NAME = "Overture Maps — Places (India)"
LICENCE = "CDLA-Permissive-2.0"

def scrub(value):
    """Text Postgres will accept.

    The run died at 628,000 of 793,045 on `PostgreSQL text fields cannot contain
    NUL (0x00) bytes`. A handful of Overture names carry stray control characters,
    and one NUL anywhere in a 2,000-row batch rejects the whole batch. Strip the
    C0 controls but keep tab, newline and carriage return, which are legitimate
    inside a freeform address.
    """
    if not value:
        return value
    return "".join(c for c in str(value) if c >= " " or c in (chr(9), chr(10), chr(13)))



def fits(value, limit):
    """The value if the column can hold it, otherwise nothing."""
    v = scrub(value or "").strip()
    return v if v and len(v) <= limit else None


def slugify(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s))[:120]

def business_slug(name, city):
    """Same shape as the existing 3.4M: name-city-<4>-<4>, so every record has a LocZ ID."""
    base = "-".join(p for p in (slugify(name), slugify(city)) if p)
    tail = f"{uuid.uuid4().hex[:4]}-{uuid.uuid4().hex[:4]}"
    return f"{base}-{tail}" if base else f"business-{tail}"

def main():
    d = duckdb.connect(); d.execute("SET memory_limit='4GB'; SET threads=3;")
    R = lambda p: f"read_csv('{p}',header=true,AUTO_DETECT=true,ignore_errors=true,all_varchar=true)"
    d.execute("CREATE VIEW k AS SELECT * FROM 'var/overture/import_candidates.parquet'")
    d.execute(f"CREATE VIEW loc AS SELECT * FROM {R('var/overture/localities.csv.gz')}")
    d.execute(f"CREATE VIEW cit AS SELECT * FROM {R('var/overture/cities.csv.gz')}")
    # City by coordinates, not by postcode.
    #
    # Overture's postcodes are not reliable here: a Shriram Finance branch in Karimnagar and
    # an eye clinic in Rajamahendravaram both carry Hyderabad postcodes, while their
    # coordinates are correct to a few metres. Chains make this matter more, not less — SBI
    # and Shriram have a branch in every city, and each one has to be filed where it stands.
    d.execute(f"CREATE TABLE cityg AS SELECT * FROM {R('var/overture/cities_geo.csv.gz')}")
    d.execute("""CREATE TABLE nearest AS
      SELECT k.id AS place_id, c.id AS city_id, c.name AS city
      FROM k JOIN cityg c ON true
      QUALIFY row_number() OVER (PARTITION BY k.id ORDER BY
        (CAST(c.latitude AS DOUBLE) - k.lat) * (CAST(c.latitude AS DOUBLE) - k.lat) +
        (CAST(c.longitude AS DOUBLE) - k.lon) * (CAST(c.longitude AS DOUBLE) - k.lon)) = 1""")

    where = "AND ci.name = ?" if PILOT_CITY else ""
    limit = f"LIMIT {LIMIT}" if LIMIT else ""
    args = [PILOT_CITY] if PILOT_CITY else []
    rows = d.execute(f"""
        SELECT k.id, k.name, k.taxonomy_hierarchy[-1] AS leaf, n.city_id, ci.name AS city,
               k.addr_postcode, k.addr_freeform, k.lat, k.lon,
               k.phones, k.websites, k.emails, k.socials
        FROM k
        JOIN nearest n ON n.place_id = k.id
        JOIN cit ci ON ci.id = n.city_id
        WHERE k.lat IS NOT NULL {where}
        {limit}""", args).fetchall()
    print(f"{len(rows):,} to import" + (f" (city: {PILOT_CITY})" if PILOT_CITY else ""))
    if not rows:
        return

    tax = {t["leaf"]: t for t in json.load(io.open("var/overture/full_taxonomy.json", encoding="utf-8"))}

    with psycopg.connect(URL, connect_timeout=90) as c:
        by_name = {r[0]: r[1] for r in c.execute("SELECT name, id FROM categories")}
        fallback = by_name.get("Other local businesses")
        cat_terms = {r[0]: r[1] for r in c.execute(
            'SELECT id, "searchTerms" FROM categories WHERE cardinality("searchTerms") > 0')}

        prepared, skipped = [], 0
        for (oid, name, leaf, city_id, city, pincode, addr, lat, lon,
             phones, sites, emails, socials) in rows:
            # Scrub before anything reads these: the slug, the keywords and the address
            # all derive from them, and a control character survives into every one.
            name, addr = scrub(name), scrub(addr)
            socials = [scrub(x) for x in (socials or [])]
            t = tax.get(leaf)
            category_id = (by_name.get(t["name"]) or by_name.get(t["parent"])) if t else fallback
            if not category_id:
                skipped += 1; continue
            keywords = (t["keywords"] if t and t["keywords"] else cat_terms.get(category_id) or [])[:10]
            addr_id = str(uuid.uuid4())
            prepared.append({
                "addr_id": addr_id, "addr_ref": addr_id if addr else None,
                "id": str(uuid.uuid7()) if hasattr(uuid, "uuid7") else str(uuid.uuid4()),
                "name": name[:180], "slug": business_slug(name, scrub(city)),
                "categoryId": category_id, "cityId": city_id,
                # Only a real six-digit pincode. The column is varchar(6), and some records
                # carry "<<not-applicable>>" or a foreign postcode like 54000 (Lahore). The
                # city no longer depends on this — it comes from the coordinates — so a bad
                # pincode is simply dropped rather than disqualifying the business.
                # Note the stripped value is what gets stored: " 500081" passes the test
                # but is seven characters, and the column holds six.
                "pincode": (pincode or "").strip()
                           if (pincode or "").strip().isdigit()
                           and len((pincode or "").strip()) == 6 else None,
                "lat": lat, "lon": lon, "addr": (addr or "")[:200] or None,
                # Length-guarded against the column widths. A value that will not fit is
                # dropped, never truncated: half a URL is a broken link and half a phone
                # number is a wrong number.
                "phone": fits(phones[0] if phones else None, 20),
                "website": fits(sites[0] if sites else None, 255),
                "email": fits(emails[0] if emails else None, 180),
                "socials": list(socials or [])[:5], "keywords": [scrub(k) for k in keywords],
                "ovt": f"ovt:{oid}",
            })
        print(f"  prepared {len(prepared):,}, skipped {skipped:,} (no category)")

        if DRY:
            print("\nDRY RUN — pass 'apply' to write. Sample:")
            for p in prepared[:6]:
                print(f"    {p['name'][:34]:<36} /b/{p['slug'][:44]}")
                print(f"       {p['addr'] or '(no address)'} | {p['phone'] or '-'}")
            return

        t0 = time.time(); written = 0
        for i in range(0, len(prepared), 2000):
            chunk = prepared[i:i + 2000]
            # The address is a row of its own, and the business points at it. Written first so
            # a business is never inserted referencing an address that does not exist.
            with c.cursor() as cur:
                cur.executemany(
                    '''INSERT INTO addresses (id, line1, "cityId", "postalCode", latitude,
                           longitude, "createdAt", "updatedAt")
                       VALUES (%(addr_id)s, %(addr)s, %(cityId)s, %(pincode)s, %(lat)s,
                           %(lon)s, now(), now())''',
                    [p for p in chunk if p["addr"]])
            c.commit()
            with c.cursor() as cur:
                cur.executemany("""
                    INSERT INTO businesses (id, name, slug, "categoryId", "cityId", "pincodeCode",
                        "addressId", latitude, longitude, "primaryPhone", website, email, keywords,
                        "socialLinks", "sourceName", "sourceRecordId", "licenceName",
                        "attributionText", "businessType", "claimStatus", "verificationStatus",
                        "isPremium", "isActive", "viewCount", "saveCount", "createdAt", "updatedAt")
                    VALUES (%(id)s, %(name)s, %(slug)s, %(categoryId)s, %(cityId)s, %(pincode)s,
                        %(addr_ref)s, %(lat)s, %(lon)s, %(phone)s, %(website)s, %(email)s, %(keywords)s,
                        %(socials)s, %(src)s, %(ovt)s, %(lic)s, %(attr)s,
                        'RETAIL_STORE', 'UNCLAIMED', 'UNVERIFIED', false, true, 0, 0, now(), now())
                    ON CONFLICT DO NOTHING""",
                    [{**p, "src": SOURCE_NAME, "lic": LICENCE, "attr": ATTRIBUTION} for p in chunk])
            c.commit(); written += len(chunk)
            print(f"  {written:,}/{len(prepared):,}  {time.time()-t0:.0f}s", flush=True)
        print(f"DONE {written:,} imported")

main()
