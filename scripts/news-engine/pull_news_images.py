"""Pull N stock photos per news category from Magnific, compress them, and save into the web repo's
public/news-images/ (baked in at build time, served at /news-images/<cat>-<i>.jpg). Free stock pulls,
premium-licensed. Run once; re-run to refresh. Resumable (skips files already present)."""
import os, io, json, time, urllib.parse, urllib.request
from PIL import Image

KEY = os.environ["MAGNIFIC_API_KEY"]
OUT = r"E:\vs code projects\scratch\locz\locznew\apps\web\public\news-images"
N = 5                      # images per category
TARGET = 46 * 1024         # <=46KB per image (space budget)
os.makedirs(OUT, exist_ok=True)

TERMS = {
    "local": "indian local neighborhood street market people",
    "tech": "technology software computer office india",
    "state": "hyderabad telangana city skyline landmark",
    "entertainment": "indian cinema film entertainment stage lights",
    "crime": "indian police crime investigation law enforcement",
    "politics": "indian government parliament building flag",
    "business": "indian business economy office corporate",
    "weather": "monsoon rain clouds indian city weather",
    "sports": "cricket stadium sports match india",
    "civic": "indian city municipal road infrastructure",
}


def api(path):
    req = urllib.request.Request("https://api.magnific.com/v1" + path,
                                 headers={"x-magnific-api-key": KEY})
    return json.load(urllib.request.urlopen(req, timeout=30))


def compress_to(url, dest):
    """Single-pass compress the full-res source to <=TARGET webp. Prefer >=1200px; drop width only
    when a detailed photo won't fit at good quality, so nothing is over-compressed twice."""
    raw = urllib.request.urlopen(url, timeout=60).read()
    src = Image.open(io.BytesIO(raw)).convert("RGB")
    for w in (1200, 1120, 1040, 960, 880, 800):
        im = src if src.width <= w else src.resize((w, round(src.height * w / src.width)), Image.LANCZOS)
        for q in range(58, 27, -4):
            im.save(dest, "WEBP", quality=q, method=6)
            if os.path.getsize(dest) <= TARGET:
                return os.path.getsize(dest)
    return os.path.getsize(dest)   # smallest attempt (800px q30)


manifest = {}
for cat, term in TERMS.items():
    got = api(f"/resources?term={urllib.parse.quote(term)}&content_type=photo&limit={N * 3}").get("data", [])
    files = []
    i = 1
    for it in got:
        if i > N:
            break
        dest = os.path.join(OUT, f"{cat}-{i}.webp")
        if os.path.exists(dest):
            files.append(f"{cat}-{i}.webp"); i += 1; continue
        try:
            dl = api(f"/resources/{it['id']}/download").get("data", {}).get("url")
            if not dl:
                continue
            kb = compress_to(dl, dest) // 1024
            print(f"  {cat}-{i}.webp  {kb} KB  <- {it.get('title','')[:40]}", flush=True)
            files.append(f"{cat}-{i}.webp"); i += 1
            time.sleep(0.3)
        except Exception as e:
            print(f"  ! {cat}-{i} failed: {str(e)[:50]}", flush=True)
    manifest[cat] = files

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=2)
print("\nmanifest:", {k: len(v) for k, v in manifest.items()})
