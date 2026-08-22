#!/usr/bin/env python3
"""
Build the local city-content database (SQLite) from the tier1/tier2 master CSV.

A normalized structure (not the flat 272-column sheet): one row per city plus child tables for
the list-type content, a key/value table for the long tail of descriptive fields, and a dedicated
IMAGE table with slots that are either pulled or flagged for Codex to generate.

Only the accurate, static content is imported. The 63 placeholder/instruction columns
("populate from India Post…", "DYNAMIC LIVE…") and the templated history/description fields are
skipped or flagged needs_regeneration=1 so the local-brain enrichment step can replace them.

    python scripts/city-content/build_city_db.py
"""
import csv, re, sqlite3, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.environ.get("CITY_CSV", r"e:/vs code projects/scratch/locz/india_tier1_tier2_96_cities_master.csv")
DB = os.path.join(HERE, "locz_cities.db")

PLACEHOLDER = re.compile(
    r"DYNAMIC|populate from|Use Wikidata|source licensed|verification required|refresh|LIVE FEED|"
    r"COMMERCIAL DATA|CLIMATE NORMALS|build child table|create locality|do not freeze|verify |"
    r"varies|No major item|CLIMATE|required$",
    re.I,
)
def is_placeholder(v: str) -> bool:
    return bool(v) and bool(PLACEHOLDER.search(v))

def clean(v):
    return (v or "").strip()

def split_list(v):
    """Split a '; '-delimited cell into clean items, dropping placeholders."""
    if not v or is_placeholder(v):
        return []
    return [p.strip() for p in re.split(r"[;|]", v) if p.strip() and not is_placeholder(p)]

SCHEMA = """
PRAGMA foreign_keys = ON;
DROP TABLE IF EXISTS city_images;
DROP TABLE IF EXISTS city_attractions;
DROP TABLE IF EXISTS city_history;
DROP TABLE IF EXISTS city_food;
DROP TABLE IF EXISTS city_industries;
DROP TABLE IF EXISTS city_attributes;
DROP TABLE IF EXISTS cities;

CREATE TABLE cities (
  id INTEGER PRIMARY KEY,
  city_name TEXT NOT NULL,
  city_slug TEXT UNIQUE,
  tier INTEGER,                     -- 1 or 2
  classification_basis TEXT,
  country TEXT, iso2 TEXT,
  state_ut TEXT, district TEXT,
  urban_agglomeration TEXT,
  latitude REAL, longitude REAL,
  time_zone TEXT, vehicle_registration_codes TEXT, telephone_std_code TEXT,
  elevation_m TEXT, area_sq_km TEXT,
  population_city_proper INTEGER, population_reference_year INTEGER,
  historical_names_alt_spellings TEXT,
  nicknames TEXT,
  short_introduction TEXT,          -- flagged needs_regeneration if templated
  detailed_description TEXT,
  what_city_is_famous_for TEXT,
  city_character TEXT,
  regional_importance TEXT,
  quality_of_life_summary TEXT,
  economy_summary TEXT,
  education_summary TEXT,
  healthcare_summary TEXT,
  transport_summary TEXT,
  climate_classification TEXT,
  seo_title TEXT, meta_description TEXT, search_keywords TEXT,
  known_for_summary TEXT,
  confidence_score REAL, data_quality_grade TEXT,
  source_organisation TEXT, retrieval_date TEXT, licence_notes TEXT,
  original_language TEXT,
  needs_regeneration INTEGER DEFAULT 0   -- 1 = the descriptive text is templated, replace via brain
);

-- Real history, one row per era (fixes the ancient==medieval duplication in the CSV).
CREATE TABLE city_history (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  era TEXT NOT NULL,                -- FOUNDING | ANCIENT | MEDIEVAL | COLONIAL | POST_INDEPENDENCE | EVENTS
  content TEXT NOT NULL,
  needs_regeneration INTEGER DEFAULT 0,
  source TEXT
);

CREATE TABLE city_attractions (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  rank INTEGER,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT
);

CREATE TABLE city_food (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,              -- FAMOUS_DISH | STREET_FOOD | SWEET | BEVERAGE | VEG | NONVEG
  name TEXT NOT NULL
);

CREATE TABLE city_industries (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

-- The long tail of static descriptive fields, kept as typed key/value rather than 200 columns.
CREATE TABLE city_attributes (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  category TEXT,                   -- History | Tourism | Food | Culture | Economy | ...
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(city_id, field)
);

-- IMAGE STORAGE. One row per image slot. Files live in object storage; this holds the reference,
-- provenance, licence and status. status=NEEDED slots are the ones to pull or hand to Codex.
CREATE TABLE city_images (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  attraction_id INTEGER REFERENCES city_attractions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,             -- HERO | LANDMARK | ATTRACTION | MAP | GALLERY
  title TEXT,
  storage_url TEXT,               -- object-storage/CDN URL once pulled/generated
  source_url TEXT,                -- where it was pulled from (if pulled)
  provider TEXT,                  -- pull | codex | upload
  source TEXT, license TEXT, attribution TEXT, attribution_required INTEGER DEFAULT 1,
  width INTEGER, height INTEGER, content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'NEEDED',  -- NEEDED | PULLED | GENERATED | APPROVED | REJECTED
  prompt TEXT,                    -- generation brief for Codex when provider=codex
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX city_images_city_idx ON city_images(city_id);
CREATE INDEX city_images_status_idx ON city_images(status);
CREATE INDEX city_attractions_city_idx ON city_attractions(city_id);
"""

# Which static descriptive columns go into the key/value city_attributes table.
KV_FIELDS = {
    "History": ["archaeological_significance", "major_rulers_kingdoms", "industrial_development",
                "heritage_neighbourhoods", "protected_monuments", "city_timeline"],
    "Tourism": ["asi_protected_monuments", "unesco_heritage_sites", "forts_palaces", "museums_galleries",
                "religious_sites", "nature_waterfronts", "best_time_to_visit", "recommended_days",
                "suitable_for", "nearby_attractions_day_trips"],
    "Food": ["regional_cuisine", "breakfast_foods", "vegetarian_specialities", "gi_tagged_products",
             "food_festivals"],
    "Culture": ["languages", "dialects", "religious_composition", "music_dance_theatre", "literature",
                "handicrafts_local_art", "architecture", "festivals", "fairs_processions"],
    "Economy": ["major_industries", "startup_ecosystem", "export_sectors", "traditional_industries"],
}

def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def main():
    rows = list(csv.DictReader(open(CSV, encoding="utf-8-sig")))
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    cur = con.cursor()

    n_attr = n_food = n_ind = n_hist = n_img = n_kv = 0
    for i, r in enumerate(rows, 1):
        g = lambda k: clean(r.get(k))
        intro = g("short_introduction")
        templated = "combines regional culture, commerce and urban services" in g("detailed_description") \
            or bool(re.search(r"is a major Indian urban centre known for", intro))
        cur.execute(
            """INSERT INTO cities (id, city_name, city_slug, tier, classification_basis, country, iso2,
                 state_ut, district, urban_agglomeration, latitude, longitude, time_zone,
                 vehicle_registration_codes, telephone_std_code, elevation_m, area_sq_km,
                 population_city_proper, population_reference_year, historical_names_alt_spellings,
                 nicknames, short_introduction, detailed_description, what_city_is_famous_for,
                 city_character, regional_importance, quality_of_life_summary, economy_summary,
                 education_summary, healthcare_summary, transport_summary, climate_classification,
                 seo_title, meta_description, search_keywords, known_for_summary, confidence_score,
                 data_quality_grade, source_organisation, retrieval_date, licence_notes,
                 original_language, needs_regeneration)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (i, g("city_name"), g("city_slug") or slugify(g("city_name")),
             1 if g("tier") == "Tier 1" else 2, g("classification_basis"), g("country"), g("iso2"),
             g("state_ut"), g("district"), g("urban_agglomeration"),
             float(g("latitude")) if g("latitude") else None,
             float(g("longitude")) if g("longitude") else None,
             g("time_zone"), g("vehicle_registration_codes"), g("telephone_std_code"),
             g("elevation_m"), g("area_sq_km"),
             int(g("population_city_proper")) if g("population_city_proper").isdigit() else None,
             int(g("population_reference_year")) if g("population_reference_year").isdigit() else None,
             g("historical_names_alt_spellings"), g("nicknames"), intro,
             g("detailed_description"), g("what_city_is_famous_for"), g("city_character"),
             g("regional_importance"), g("quality_of_life_summary"), g("economy_summary"),
             g("education_summary"), g("healthcare_summary"), g("transport_summary"),
             g("climate_classification"), g("seo_title"), g("meta_description"), g("search_keywords"),
             g("known_for_summary"), float(g("confidence_score")) if g("confidence_score") else None,
             g("data_quality_grade"), g("source_organisation"), g("retrieval_date"),
             g("licence_notes"), g("original_language"), 1 if templated else 0),
        )

        # History eras (flag placeholders/duplicates for regeneration).
        for era, col in [("FOUNDING", "founding_or_earliest_settlement"), ("ANCIENT", "ancient_history"),
                         ("MEDIEVAL", "medieval_history"), ("COLONIAL", "colonial_history"),
                         ("POST_INDEPENDENCE", "post_independence_development"),
                         ("EVENTS", "important_historical_events")]:
            v = g(col)
            if v:
                cur.execute("INSERT INTO city_history (city_id, era, content, needs_regeneration) VALUES (?,?,?,?)",
                            (i, era, v, 1 if is_placeholder(v) else 0))
                n_hist += 1

        # Attractions (top 5 + any extras from major_attractions).
        seen = set()
        rank = 0
        for col in ["attraction_1", "attraction_2", "attraction_3", "attraction_4", "attraction_5"]:
            v = g(col)
            if v and not is_placeholder(v) and v.lower() not in seen:
                rank += 1; seen.add(v.lower())
                cur.execute("INSERT INTO city_attractions (city_id, rank, name) VALUES (?,?,?)", (i, rank, v))
                n_attr += 1
        for v in split_list(g("major_attractions")):
            if v.lower() not in seen:
                rank += 1; seen.add(v.lower())
                cur.execute("INSERT INTO city_attractions (city_id, rank, name) VALUES (?,?,?)", (i, rank, v))
                n_attr += 1

        # Food.
        for kind, col in [("FAMOUS_DISH", "famous_dishes"), ("STREET_FOOD", "street_food"),
                          ("SWEET", "sweets_desserts"), ("BEVERAGE", "beverages"),
                          ("VEG", "vegetarian_specialities"), ("NONVEG", "non_vegetarian_specialities")]:
            for v in split_list(g(col)):
                cur.execute("INSERT INTO city_food (city_id, kind, name) VALUES (?,?,?)", (i, kind, v)); n_food += 1

        # Industries.
        for v in split_list(g("major_industries")):
            cur.execute("INSERT INTO city_industries (city_id, name) VALUES (?,?)", (i, v)); n_ind += 1

        # Key/value long tail (static only).
        for cat, cols in KV_FIELDS.items():
            for col in cols:
                v = g(col)
                if v and not is_placeholder(v):
                    cur.execute("INSERT OR IGNORE INTO city_attributes (city_id, category, field, value) VALUES (?,?,?,?)",
                                (i, cat, col, v)); n_kv += 1

        # Image slots: HERO + MAP always; one ATTRACTION slot per top-5 attraction.
        cur.execute("INSERT INTO city_images (city_id, kind, title, provider, status, prompt) VALUES (?,?,?,?,?,?)",
                    (i, "HERO", f"{g('city_name')} hero image", "codex", "NEEDED",
                     f"Photoreal wide hero image of {g('city_name')}, {g('state_ut')} — its most iconic skyline/landmark, daytime, no text.")); n_img += 1
        cur.execute("INSERT INTO city_images (city_id, kind, title, provider, status) VALUES (?,?,?,?,?)",
                    (i, "MAP", f"{g('city_name')} location map", "pull", "NEEDED")); n_img += 1
        for (aid, aname) in cur.execute("SELECT id, name FROM city_attractions WHERE city_id=? ORDER BY rank LIMIT 5", (i,)).fetchall():
            cur.execute("INSERT INTO city_images (city_id, attraction_id, kind, title, provider, status, prompt) VALUES (?,?,?,?,?,?,?)",
                        (i, aid, "ATTRACTION", aname, "codex", "NEEDED",
                         f"Photoreal image of {aname} in {g('city_name')}, {g('state_ut')}, no text, no watermark.")); n_img += 1

    con.commit()

    def one(q):
        return cur.execute(q).fetchone()[0]
    print(f"DB written: {DB}")
    print(f"cities: {one('SELECT COUNT(*) FROM cities')} (tier1 {one('SELECT COUNT(*) FROM cities WHERE tier=1')}, tier2 {one('SELECT COUNT(*) FROM cities WHERE tier=2')})")
    print(f"attractions: {n_attr} | food: {n_food} | industries: {n_ind} | history rows: {n_hist} ({one('SELECT COUNT(*) FROM city_history WHERE needs_regeneration=1')} need regen)")
    print(f"attributes(kv): {n_kv} | image slots: {n_img} (all NEEDED)")
    print(f"cities with templated description needing regen: {one('SELECT COUNT(*) FROM cities WHERE needs_regeneration=1')}")
    con.close()

if __name__ == "__main__":
    main()
