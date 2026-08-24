"""Generate the LocZ news feed matrix (state x category) from prod cities -> feeds.json.

For each state we take its biggest tier-1/2 cities as the query terms + the largest as the map
anchor (lat/lng), and pair them with category keyword groups. English search feeds only —
regional comes from IndicTrans2 translation downstream. Run on the VPS; writes /tmp/feeds.json.
"""
import json, psycopg
from urllib.parse import quote

CATS = {
    "local": "",
    "state": "",  # same terms, state-wide framing (kept distinct for the taxonomy)
    "business": "business OR economy OR startup OR company OR market",
    "tech": "technology OR IT OR software OR startup",
    "sports": "sports OR cricket OR kabaddi OR football",
    "entertainment": "cinema OR film OR entertainment OR celebrity",
    "politics": "politics OR government OR minister OR assembly OR election",
    "crime": "crime OR police OR arrested OR fraud",
    "civic": "civic OR municipal OR roads OR water OR power OR corporation",
    "weather": "weather OR rain OR flood OR temperature OR forecast",
}

STATE_LANG = {
    "Telangana": "te", "Andhra Pradesh": "te", "Tamil Nadu": "ta", "Karnataka": "kn",
    "Maharashtra": "mr", "West Bengal": "bn", "Kerala": "ml", "Gujarat": "gu",
    "Odisha": "or", "Punjab": "pa", "Assam": "as", "Bihar": "hi", "Uttar Pradesh": "hi",
    "Madhya Pradesh": "hi", "Rajasthan": "hi", "Haryana": "hi", "Jharkhand": "hi",
    "Chhattisgarh": "hi", "Uttarakhand": "hi", "Himachal Pradesh": "hi", "Delhi": "hi",
    "Goa": "kn", "Manipur": "hi", "Tripura": "bn",
}

c = psycopg.connect(open("/tmp/locz_dburl").read().strip(), connect_timeout=60, autocommit=True)
feeds = []
states = c.execute(
    'SELECT s.name FROM states s JOIN cities ct ON ct."stateId"=s.id '
    'WHERE ct.tier IN (1,2) GROUP BY s.name ORDER BY s.name').fetchall()
for (state,) in states:
    cities = c.execute(
        'SELECT ct.name, ct.latitude, ct.longitude FROM cities ct JOIN states s ON s.id=ct."stateId" '
        'WHERE s.name=%s AND ct.tier IN (1,2) ORDER BY COALESCE(ct.population,0) DESC LIMIT 3',
        (state,)).fetchall()
    if not cities:
        continue
    anchor = cities[0]
    terms = " OR ".join(f'"{n}"' if " " in n else n for n, _, _ in cities)
    for cat, kw in CATS.items():
        q = f"({terms})" + (f" {kw}" if kw else "")
        url = (f"https://news.google.com/rss/search?q={quote(q)}"
               f"&hl=en-IN&gl=IN&ceid=IN:en")
        feeds.append({
            "category": cat, "state": state, "city": anchor[0],
            "lat": float(anchor[1]), "lng": float(anchor[2]),
            "state_lang": STATE_LANG.get(state, "hi"), "url": url,
        })
json.dump(feeds, open("/tmp/feeds.json", "w"), ensure_ascii=False, indent=0)
print(f"{len(feeds)} feeds across {len(states)} states -> /tmp/feeds.json")
print("sample:", feeds[0]["state"], feeds[0]["category"], "|", feeds[0]["url"][:80])
