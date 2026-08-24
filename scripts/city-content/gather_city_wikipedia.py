"""Gather rich, attributed city content from Wikipedia for the 96 tier-1/2 cities.

The city page had ~2% of what it could show. Wikipedia carries the encyclopedic depth — history,
geography, demographics, economy, culture, landmarks, transport — under a permissive licence
(CC BY-SA 4.0, attribution required). This pulls the lead + the sections a city page actually
uses and stores them in `city_sections`, with the source URL and licence on every row.

Facts come from Wikipedia; nothing is invented here. An LLM refinement pass (later) can tighten
each section into 2–3 page-ready paragraphs, but the source of truth stays Wikipedia.

Resumable: a city already gathered is skipped. Run: python gather_city_wikipedia.py [apply]
"""
import sqlite3, json, re, sys, time, urllib.parse, urllib.request, os

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "locz_cities.db")
UA = "LocZ/1.0 (https://locz.in; support@locz.in)"
DRY = "apply" not in sys.argv

# The sections a city page renders, mapped from Wikipedia's headings (some cities vary).
WANT = {
    "history": ["History"],
    "geography": ["Geography", "Climate", "Topography"],
    "demographics": ["Demographics", "Population"],
    "economy": ["Economy"],
    "culture": ["Culture", "Cuisine", "Festivals", "Arts"],
    "tourism": ["Tourism", "Cityscape", "Places of interest", "Landmarks", "Tourist attractions"],
    "transport": ["Transport", "Transportation", "Connectivity"],
    "education": ["Education"],
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return json.load(urllib.request.urlopen(req, timeout=30))


def summary(title):
    try:
        d = get("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title))
        if d.get("type") == "disambiguation":
            return None
        return d
    except Exception:
        return None


def full_extract(title):
    url = ("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1"
           "&exsectionformat=wiki&redirects=1&format=json&titles=" + urllib.parse.quote(title))
    pages = get(url)["query"]["pages"]
    page = next(iter(pages.values()))
    return page.get("extract", "")


def split_sections(text):
    """Wikipedia plaintext uses '== Heading ==' (and '=== Sub ==='). Return {heading: body}."""
    parts = re.split(r"\n==+ (.+?) ==+\n", text)
    out = {}
    # parts[0] is the lead; then heading, body, heading, body...
    for i in range(1, len(parts) - 1, 2):
        out.setdefault(parts[i].strip(), parts[i + 1].strip())
    return parts[0].strip(), out


def resolve(city_name, state):
    for title in (city_name, f"{city_name}, {state}", city_name.split(" ")[0]):
        s = summary(title)
        if s and s.get("type") == "standard":
            return s
    return None


def main():
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS city_sections(
        id INTEGER PRIMARY KEY, city_id INTEGER, section_key TEXT, title TEXT,
        content TEXT, source_url TEXT, license TEXT, source TEXT,
        UNIQUE(city_id, section_key))""")
    cities = c.execute("SELECT id, city_name, state_ut FROM cities ORDER BY tier, city_name").fetchall()
    done_ids = {r[0] for r in c.execute("SELECT DISTINCT city_id FROM city_sections")}

    ok = miss = 0
    for cid, name, state in cities:
        if cid in done_ids:
            continue
        s = resolve(name, state)
        if not s:
            print(f"  MISS  {name} ({state})", flush=True); miss += 1; continue
        page_title = s["titles"]["canonical"]
        src_url = s["content_urls"]["desktop"]["page"]
        try:
            lead, secs = split_sections(full_extract(page_title))
        except Exception as e:
            print(f"  ERR   {name}: {type(e).__name__}", flush=True); miss += 1; continue

        rows = []
        if lead:
            rows.append((cid, "overview", "Overview", lead[:4000], src_url, "CC BY-SA 4.0", "Wikipedia"))
        for key, headings in WANT.items():
            body = next((secs[h] for h in headings if h in secs and secs[h]), None)
            if body and len(body) > 60:
                rows.append((cid, key, headings[0], body[:4000], src_url, "CC BY-SA 4.0", "Wikipedia"))

        if rows and not DRY:
            c.executemany(
                "INSERT OR REPLACE INTO city_sections"
                "(city_id,section_key,title,content,source_url,license,source) VALUES (?,?,?,?,?,?,?)", rows)
            c.commit()
        print(f"  {'DRY ' if DRY else 'OK  '}{name}: {len(rows)} sections ({', '.join(r[1] for r in rows)})", flush=True)
        ok += 1
        if DRY and ok >= 2:
            print("  (dry run — stopping after 2 cities)"); break
        time.sleep(0.4)  # be gentle on Wikipedia
    print(f"\nGathered {ok} cities, {miss} missed.")


main()
