"""Grow / top up the LocZ news-image pool from Magnific stock, within the daily 100-download cap.

Model: category-generic premium-licensed photos, N per category, served from the web app's
public/news-images/<cat>-<i>.webp. The engine picks one at random per story (pool size read from
manifest.json), so growing the pool needs NO engine edit -- just more files + a fresh manifest.

Schedule (why this shape):
  * Photos are category art, not per-headline, so they do NOT need daily refresh. The 100/day cap
    only bites while BUILDING the pool. Run this on demand until every category hits TARGET_POOL,
    then only occasionally (monthly-ish) to swap in fresh shots or add a category.
  * Idempotent + append-only + resumable: a daily ledger caps pulls at DAILY_BUDGET (< 100). A 402
    (cap hit) just stops cleanly; re-run tomorrow and it continues from the next free slot.
  * After a run that added files: re-commit apps/web/public/news-images + manifest.json, copy the
    manifest to the engine box (C:\\locz-news\\news-images\\manifest.json), deploy web.

Usage:  MAGNIFIC_API_KEY=... python refresh_news_images.py [--target 15] [--budget 90]
"""
import os, io, sys, json, time, glob, re, argparse, datetime, urllib.parse, urllib.request
from PIL import Image

KEY = os.environ["MAGNIFIC_API_KEY"]
OUT = r"E:\vs code projects\scratch\locz\locznew\apps\web\public\news-images"
LEDGER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "magnific_ledger.json")
TARGET = 46 * 1024                 # <=46KB per image (space budget)
os.makedirs(OUT, exist_ok=True)

ap = argparse.ArgumentParser()
ap.add_argument("--target", type=int, default=15, help="images per category to reach")
ap.add_argument("--budget", type=int, default=90, help="max Magnific downloads today (< 100 cap)")
args = ap.parse_args()

# Search-term rotation: several phrasings per category so a top-up pulls fresh, varied shots instead
# of the same first results. One is picked per run based on how full the category already is.
TERMS = {
    "local": ["indian local neighborhood street market people", "indian street vendor bazaar crowd",
              "small town india daily life street"],
    "tech": ["technology software computer office india", "indian engineers startup workspace",
             "data center servers digital india"],
    "state": ["hyderabad telangana city skyline landmark", "andhra pradesh city landmark monument",
              "south india cityscape aerial"],
    "entertainment": ["indian cinema film entertainment stage lights", "telugu film shooting camera set",
                      "concert stage crowd lights india"],
    "crime": ["indian police crime investigation law enforcement", "police barricade night patrol india",
              "courtroom justice law india"],
    "politics": ["indian government parliament building flag", "political rally crowd india flags",
                 "secretariat government office india"],
    "business": ["indian business economy office corporate", "indian stock market trading finance",
                 "factory manufacturing workers india"],
    "weather": ["monsoon rain clouds indian city weather", "flooded street heavy rain india",
                "summer heat sun indian city"],
    "sports": ["cricket stadium sports match india", "kabaddi hockey indian sport action",
               "athletics running track india"],
    "civic": ["indian city municipal road infrastructure", "garbage collection sanitation worker india",
              "water supply pipeline construction india"],
}


def api(path):
    req = urllib.request.Request("https://api.magnific.com/v1" + path,
                                 headers={"x-magnific-api-key": KEY})
    return json.load(urllib.request.urlopen(req, timeout=30))


def compress_to(url, dest):
    """Single-pass full-res -> <=TARGET webp. Prefer >=1200px; drop width only when a detailed photo
    won't fit at good quality, so nothing is over-compressed twice."""
    raw = urllib.request.urlopen(url, timeout=60).read()
    src = Image.open(io.BytesIO(raw)).convert("RGB")
    for w in (1200, 1040, 900, 760, 640):
        im = src if src.width <= w else src.resize((w, round(src.height * w / src.width)), Image.LANCZOS)
        for q in range(58, 19, -4):
            im.save(dest, "WEBP", quality=q, method=6)
            if os.path.getsize(dest) <= TARGET:
                return os.path.getsize(dest)
    return os.path.getsize(dest)


def spent_today():
    today = datetime.date.today().isoformat()
    try:
        led = json.load(open(LEDGER))
    except Exception:
        led = {}
    return today, led, led.get(today, 0)


def bump(today, led, n):
    led[today] = led.get(today, 0) + n
    json.dump(led, open(LEDGER, "w"), indent=2)


def have(cat):
    return sorted(int(re.search(r"-(\d+)\.webp$", f).group(1))
                  for f in glob.glob(os.path.join(OUT, f"{cat}-*.webp")))


today, led, used = spent_today()
budget_left = max(0, args.budget - used)
print(f"cap ledger: {used} used today, {budget_left} left of {args.budget} (Magnific hard cap ~100)")
if budget_left == 0:
    print("daily budget exhausted -- re-run tomorrow.")
    sys.exit(0)

added = 0
for cat, terms in TERMS.items():
    if budget_left <= 0:
        break
    slots = have(cat)
    nxt = (max(slots) + 1) if slots else 1
    need = max(0, args.target - len(slots))
    if need == 0:
        continue
    term = terms[len(slots) % len(terms)]           # rotate phrasing as the pool fills
    try:
        got = api(f"/resources?term={urllib.parse.quote(term)}"
                  f"&content_type=photo&limit={need * 3}").get("data", [])
    except Exception as e:
        print(f"  ! {cat} search failed: {str(e)[:60]}"); continue
    for it in got:
        if need <= 0 or budget_left <= 0:
            break
        dest = os.path.join(OUT, f"{cat}-{nxt}.webp")
        try:
            dl = api(f"/resources/{it['id']}/download").get("data", {}).get("url")
            if not dl:
                continue
            kb = compress_to(dl, dest) // 1024
            print(f"  +{cat}-{nxt}.webp  {kb} KB  <- {it.get('title','')[:40]}", flush=True)
            nxt += 1; need -= 1; budget_left -= 1; added += 1
            bump(today, led, 1)                      # persist after EACH pull (cap-safe on crash)
            time.sleep(0.3)
        except urllib.error.HTTPError as e:
            if e.code == 402:
                print("  ! Magnific daily cap hit (402) -- stopping, resume tomorrow.")
                budget_left = 0; break
            print(f"  ! {cat}-{nxt} failed: {e}")
        except Exception as e:
            print(f"  ! {cat}-{nxt} failed: {str(e)[:50]}")

# Rebuild manifest from whatever is actually on disk
m = {}
for f in sorted(glob.glob(os.path.join(OUT, "*.webp"))):
    b = os.path.basename(f)
    m.setdefault(re.sub(r"-\d+\.webp$", "", b), []).append(b)
json.dump(m, open(os.path.join(OUT, "manifest.json"), "w"), indent=2)
print(f"\nadded {added} images this run. pool now:", {k: len(v) for k, v in m.items()})
print("next: commit news-images + manifest, copy manifest to C:\\locz-news\\news-images\\, deploy web.")
