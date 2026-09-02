"""Shared news-image selection: category pools + a topic-keyed relevance layer.

Used by both engine.py (new stories) and backfill_news_images.py (existing rows) so the two never
drift. Images live in <img_dir> as <cat>-<i>.webp and t-<topic>-<i>.webp; manifest.json holds the
counts. A story maps to a topic by keyword; if that topic has images we serve one, else we fall
back to the category pool -- so topics only ever IMPROVE relevance, never break rendering.
"""
import os, json, random, re

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
    ("stockmarket", ["sensex", "nifty", "stock market", "stock exchange", "nse", "bse", "share market", "shareholder", "ipo", "bourse"]),
    ("startup", ["startup", "start-up", "funding round", "venture", "unicorn"]),
    ("assault", ["rape", "molest", "assault", "harassment", "abuse", "eve teasing", "stalk"]),
    ("drugs", ["ganja", "narcotic", "cannabis", "peddler", "brown sugar", "kg of", "drugs", "seized kg"]),
    ("weapon", ["weapon", "rifle", "pistol", " arms", "ammunition", "firearm"]),
    ("theft", ["theft", "stolen", "robbery", "burglary", "loot", "heist"]),
    ("marathon", ["marathon", "runners", "10k run", "5k run", "fun run", "walkathon"]),
    ("arrest", ["arrest", "detain", "custody", "nabbed", "held by police"]),
    ("murder", ["murder", "killed", "stabb", "shot dead", "homicide", "body found", "slashed to death", "hacked to death", "beaten to death", "slain", "lynched"]),
    ("fraud", ["fraud", "scam", "cheat", "ponzi", "forgery", "bribe", "corruption"]),
    ("accident", ["accident", "crash", "collision", "mishap", "overturn", "derail"]),
    ("fire", ["fire", "blaze", "gutted", "flames", "explosion", "blast"]),
    ("election", ["election", "polling", "polls", "vote", "campaign", "by-election", "constituency", "ballot", "mla", "mp seat"]),
    ("protest", ["protest", "strike", "agitation", "dharna", "rally", "bandh", "demonstrat"]),
    ("temple", ["temple", "mandir", "devotee", "darshan", "pooja", "deity", "shrine"]),
    ("festival", ["festival", "bonalu", "bathukamma", "ganesh", "diwali", "dussehra", "utsav", "navratri"]),
    ("cricket", ["cricket", " ipl", "batsman", "bowler", "wicket", "test match", " odi", " t20"]),
    ("farmer", ["farmer", "crop", "paddy", "harvest", "agricultur", "irrigation", "rythu", "kisan"]),
    ("metro", ["metro", "railway", " train ", "mmts", "local train"]),
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
    "assault": "police patrol car night city street", "drugs": "police seized narcotics table",
    "marathon": "marathon runners city race crowd",
}


# --- Local Stable-Diffusion prompt building (gen_news_images.py) ----------------------------------
# Concrete SCENE per topic. Abstract topics (tax, markets, a poll result) can't be drawn from the
# headline -- SD renders a generic street -- so we replace the headline with a concrete scene. For
# depictable topics we keep the headline (SD draws "lake near completion" well) and only add style.
STYLE_SUFFIX = "editorial news photograph, India, realistic, natural light, documentary, high detail, 35mm"
# A concrete SCENE for EVERY topic. Headlines rarely describe an image ("Gang Arrested in Counterfeit
# Currency Case" -> SD draws a random face), so whenever a topic matches we render its scene, not the
# headline. Only truly unmatched headlines fall back to the (cleaned) headline text.
TOPIC_PROMPT = {
    "lake": "aerial view of a large lake or reservoir beside an Indian town",
    "river": "a wide Indian river with boats and green banks",
    "flood": "a flooded Indian street with waterlogged vehicles and people wading through water",
    "rain": "heavy monsoon rain on an Indian city street, people with umbrellas",
    "heat": "a hazy summer afternoon in an Indian city under a blazing sun",
    "tax": "Indian rupee currency notes and coins on a desk with a calculator and tax documents",
    "stockmarket": "a stock market trading screen with rising graphs in an Indian finance office",
    "startup": "a young Indian startup team working at laptops in a modern office",
    "assault": "an Indian police patrol vehicle on a city street at night with blue lights",
    "drugs": "seized packets of narcotics and cash laid out on a table with Indian police",
    "marathon": "a large crowd of runners taking part in a city marathon in India",
    "weapon": "an array of seized firearms and rifles laid out on a table",
    "theft": "an Indian police officer inspecting a burgled shop, crime scene",
    "arrest": "Indian police officers escorting a handcuffed suspect",
    "murder": "an Indian police crime scene cordoned off with yellow tape at night",
    "fraud": "stacks of Indian rupee notes with handcuffs and documents on a table, financial fraud",
    "accident": "a damaged car after a road accident on an Indian highway with police present",
    "fire": "firefighters battling a large building fire with flames and smoke in India",
    "election": "an Indian polling booth with an electronic voting machine and voters in a queue",
    "protest": "a large Indian street protest, a crowd holding placards and banners",
    "temple": "a South Indian temple gopuram with devotees",
    "festival": "a vibrant Indian festival celebration with lights and a crowd",
    "cricket": "a cricket stadium with a batsman playing a shot under floodlights in India",
    "farmer": "an Indian farmer working in a green paddy field",
    "metro": "a modern Hyderabad metro train at an elevated station",
    "hospital": "an Indian hospital ward with a doctor attending to a patient",
    "school": "Indian students in uniform sitting in a classroom",
    "water": "a public drinking-water tap with people filling steel pots in an Indian town",
    "power": "high-voltage electricity transmission towers and power lines at dusk in India",
}


# Safe, neutral scene per category -- the fallback when no topic matches. Never depicts victims or
# renders a raw sensitive headline (e.g. an assault story must NOT generate identifiable people).
CATEGORY_PROMPT = {
    "local": "a busy Indian neighbourhood street with shops and people",
    "tech": "a modern Indian technology office with computers and screens",
    "state": "the Hyderabad city skyline with landmarks",
    "entertainment": "a cinema hall with bright stage lights, India",
    "crime": "an Indian police station with a police vehicle parked outside",
    "politics": "an Indian government secretariat building with flags",
    "business": "an Indian business district with modern office buildings",
    "weather": "a dramatic monsoon sky over an Indian city",
    "sports": "a sports stadium with a running track in India",
    "civic": "an Indian city road with municipal infrastructure",
}


def build_prompt(title, category=""):
    """SD prompt: matched topic's concrete scene -> safe category scene. Never the raw headline
    (avoids random/similar faces and fabricating people for sensitive stories)."""
    scene = TOPIC_PROMPT.get(topic_of(title)) or CATEGORY_PROMPT.get(category) or CATEGORY_PROMPT["state"]
    return f"{scene}. {STYLE_SUFFIX}"


def load_pool(img_dir):
    try:
        with open(os.path.join(img_dir, "manifest.json"), encoding="utf-8") as f:
            return {k: len(v) for k, v in json.load(f).items() if v}
    except Exception:
        return {}


def topic_of(title):
    # Match each keyword at a WORD START (prefix ok: "stabb"->"stabbed", "demonstrat"->"demonstration")
    # but never mid-word -- so "rain" no longer matches "Ukraine", "poll" not "pollution", etc.
    t = (title or "").lower()
    for topic, kws in TOPIC_MAP:
        for k in kws:
            if re.search(r"\b" + re.escape(k.strip()), t):
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
