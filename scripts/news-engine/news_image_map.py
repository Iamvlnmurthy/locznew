"""Shared news-image selection: category pools + a topic-keyed relevance layer.

Used by both engine.py (new stories) and backfill_news_images.py (existing rows) so the two never
drift. Images live in <img_dir> as <cat>-<i>.webp and t-<topic>-<i>.webp; manifest.json holds the
counts. A story maps to a topic by keyword; if that topic has images we serve one, else we fall
back to the category pool -- so topics only ever IMPROVE relevance, never break rendering.
"""
import os, json, random

DEFAULT_CATS = ("local", "tech", "state", "entertainment", "crime",
                "politics", "business", "weather", "sports", "civic")

# First matching topic wins -> order most-specific first. Keyword = substring match on the headline.
TOPIC_MAP = [
    ("lake", ["lake", "cheruvu", "reservoir", "pond", "kunta"]),
    ("river", ["river", "godavari", "krishna", "canal", "stream"]),
    ("flood", ["flood", "inundat", "waterlog", "deluge", "submerg"]),
    ("rain", ["rain", "monsoon", "downpour", "cloudburst", "showers"]),
    ("heat", ["heatwave", "heat wave", "temperature soar", "scorching"]),
    ("tax", ["gst", " tax", "revenue", "budget", "fiscal", "excise"]),
    ("stockmarket", ["sensex", "nifty", "stock market", "shares", "ipo", "bourse"]),
    ("startup", ["startup", "start-up", "funding round", "venture", "unicorn"]),
    ("weapon", ["weapon", "rifle", "pistol", " arms", "ammunition", "firearm"]),
    ("theft", ["theft", "stolen", "robbery", "burglary", "loot", "heist"]),
    ("arrest", ["arrest", "detain", "custody", "nabbed", "held by police"]),
    ("murder", ["murder", "killed", "stabb", "shot dead", "homicide", "body found"]),
    ("fraud", ["fraud", "scam", "cheat", "ponzi", "forgery", "bribe", "corruption"]),
    ("accident", ["accident", "crash", "collision", "mishap", "overturn", "derail"]),
    ("fire", ["fire", "blaze", "gutted", "flames", "explosion", "blast"]),
    ("election", ["election", "poll", "vote", "campaign", "constituency", "ballot", " mla", " mp seat"]),
    ("protest", ["protest", "strike", "agitation", "dharna", "rally", "bandh", "demonstrat"]),
    ("temple", ["temple", "mandir", "devotee", "darshan", "pooja", "deity", "shrine"]),
    ("festival", ["festival", "bonalu", "bathukamma", "ganesh", "diwali", "dussehra", "utsav", "celebrat"]),
    ("cricket", ["cricket", " ipl", "batsman", "bowler", "wicket", "test match", " odi", " t20"]),
    ("farmer", ["farmer", "crop", "paddy", "harvest", "agricultur", "irrigation", "rythu", "kisan"]),
    ("metro", ["metro", "railway", " train", " orr", "flyover", "highway", "road widening"]),
    ("hospital", ["hospital", "health", "dengue", "fever", "medic", "patient", "vaccine", "disease"]),
    ("school", ["school", "student", " exam", "college", "university", "education", "eamcet", " ssc "]),
    ("water", ["drinking water", "water supply", " tap ", "borewell", "pipeline"]),
    ("power", ["power cut", "electricity", "transco", "discom", "load shedding", "transformer"]),
]

# Magnific search phrasing per topic (India-focused), used by refresh_news_images.py.
TOPIC_TERMS = {
    "lake": "indian lake water reservoir scenic", "river": "indian river flowing water landscape",
    "flood": "flooded street heavy rain india", "rain": "monsoon rain umbrella indian city",
    "heat": "summer heat sun indian city haze", "tax": "indian finance tax money rupee calculator",
    "stockmarket": "indian stock market trading screen finance", "startup": "indian startup team office workspace",
    "weapon": "seized firearms weapons police table", "theft": "burglary break-in crime scene night",
    "arrest": "indian police arrest handcuffs custody", "murder": "police crime scene investigation tape",
    "fraud": "financial fraud documents magnifying handcuffs", "accident": "road accident damaged car india",
    "fire": "building fire blaze firefighters", "election": "indian election voting evm polling booth",
    "protest": "indian protest rally crowd placards", "temple": "south indian temple gopuram devotees",
    "festival": "indian festival celebration lights crowd", "cricket": "cricket stadium batsman action india",
    "farmer": "indian farmer paddy field agriculture", "metro": "hyderabad metro train station india",
    "hospital": "indian hospital doctor patient healthcare", "school": "indian students classroom school",
    "water": "drinking water supply tap india", "power": "electricity power lines transformer india",
}


def load_pool(img_dir):
    try:
        with open(os.path.join(img_dir, "manifest.json"), encoding="utf-8") as f:
            return {k: len(v) for k, v in json.load(f).items() if v}
    except Exception:
        return {}


def topic_of(title):
    t = " " + (title or "").lower() + " "
    for topic, kws in TOPIC_MAP:
        if any(k in t for k in kws):
            return topic
    return None


def _pick(pool, name, key):
    n = pool.get(name, 0)
    if not n:
        return None
    idx = (int(key[:8], 16) % n) if key else random.randint(0, n - 1)
    return f"/news-images/{name}-{idx + 1}.webp"


def image_for(pool, title, category, key=""):
    """Topic image if the topic has any; else the category pool; else a safe 'state' fallback."""
    topic = topic_of(title)
    if topic:
        u = _pick(pool, f"t-{topic}", key)
        if u:
            return u
    cat = category if category in pool else "state"
    return _pick(pool, cat, key) or f"/news-images/state-1.webp"
