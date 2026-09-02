"""Build the LocZ news-image pools from the Pexels free API (real photos, real faces, ~uncapped).

Replaces Magnific (100/day cap) as the stock source. Fills the SAME pools the engine already serves:
category slugs (<cat>-<i>.webp) and topic slugs (t-<topic>-<i>.webp), tracked in manifest.json, so
no engine change is needed. Each image is center-cropped to 16:10 and saved as webp <=46KB.

Pexels: GET https://api.pexels.com/v1/search  header  Authorization: <API_KEY>  (free, no attribution
required). 200 req/hr, 20k/mo -- enough to fill every pool in one run.

  MAGNIFIC unused now.  set PEXELS_API_KEY and run:
  PEXELS_API_KEY=... python refresh_pexels.py [--target 15] [--topic-target 4]
"""
import os, io, sys, json, time, glob, re, argparse, urllib.parse, urllib.request
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import news_image_map as nim

KEY = os.environ["PEXELS_API_KEY"]
OUT = r"E:\vs code projects\scratch\locz\locznew\apps\web\public\news-images"
CARD = (1200, 750)                 # 16:10, matches the news card + og:image
TARGET = 46 * 1024
os.makedirs(OUT, exist_ok=True)

ap = argparse.ArgumentParser()
ap.add_argument("--target", type=int, default=15, help="images per category")
ap.add_argument("--topic-target", type=int, default=4, help="images per topic")
args = ap.parse_args()

# Category search terms (India-focused). Topics reuse nim.TOPIC_TERMS.
TERMS = {
    "local": "indian street market people", "tech": "technology office india",
    "state": "hyderabad city skyline", "entertainment": "indian cinema stage concert",
    "crime": "indian police", "politics": "indian government parliament",
    "business": "indian business office", "weather": "monsoon rain india",
    "sports": "cricket stadium india", "civic": "indian city road infrastructure",
}


def search(term, n):
    url = ("https://api.pexels.com/v1/search?orientation=landscape&size=large"
           f"&per_page={min(80, n)}&query={urllib.parse.quote(term)}")
    req = urllib.request.Request(url, headers={"Authorization": KEY, "User-Agent": "locz-news/1.0"})
    return json.load(urllib.request.urlopen(req, timeout=30)).get("photos", [])


def cover_webp(src_url, dest):
    # images.pexels.com 403s a bare urllib agent -> send a browser UA + referer
    req = urllib.request.Request(src_url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Referer": "https://www.pexels.com/"})
    raw = urllib.request.urlopen(req, timeout=60).read()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    # center-crop to 16:10 then fit to CARD
    tw, th = CARD
    scale = max(tw / im.width, th / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left, top = (im.width - tw) // 2, (im.height - th) // 2
    im = im.crop((left, top, left + tw, top + th))
    for q in range(80, 19, -6):
        im.save(dest, "WEBP", quality=q, method=6)
        if os.path.getsize(dest) <= TARGET:
            break
    return os.path.getsize(dest) // 1024


def have(name):
    return sorted(int(re.search(r"-(\d+)\.webp$", f).group(1))
                  for f in glob.glob(os.path.join(OUT, f"{name}-*.webp")))


added = 0


def fill(name, term, target):
    global added
    slots = have(name)
    nxt = (max(slots) + 1) if slots else 1
    need = max(0, target - len(slots))
    if need == 0:
        return
    try:
        photos = search(term, need * 2)
    except Exception as e:
        print(f"  ! {name} search failed: {str(e)[:70]}"); return
    for p in photos:
        if need <= 0:
            break
        src = (p.get("src") or {}).get("large2x") or (p.get("src") or {}).get("large")
        if not src:
            continue
        dest = os.path.join(OUT, f"{name}-{nxt}.webp")
        try:
            kb = cover_webp(src, dest)
            print(f"  +{name}-{nxt}.webp {kb:2d}KB  <- {(p.get('alt') or '')[:40]}", flush=True)
            nxt += 1; need -= 1; added += 1
            time.sleep(0.2)
        except Exception as e:
            print(f"  ! {name}-{nxt} failed: {str(e)[:50]}")


for cat, term in TERMS.items():
    fill(cat, term, args.target)
for topic, term in nim.TOPIC_TERMS.items():
    fill(f"t-{topic}", term, args.topic_target)

m = {}
for f in sorted(glob.glob(os.path.join(OUT, "*.webp"))):
    b = os.path.basename(f)
    m.setdefault(re.sub(r"-\d+\.webp$", "", b), []).append(b)
json.dump(m, open(os.path.join(OUT, "manifest.json"), "w"), indent=2)
print(f"\nadded {added}. pools now:", {k: len(v) for k, v in m.items() if not k.startswith('gen')})
