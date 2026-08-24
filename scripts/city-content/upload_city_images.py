"""Upload city images (hero/attraction/map) to object storage and create prod city_images rows.

Runs on the VPS: reads STORAGE_* from /home/locz/app/.env, puts each webp under
city-images/<slug>/<file> in the locz-media bucket, and upserts a city_images row pointing at the
public URL — with the source/licence/attribution the image must carry. Idempotent per city
(clears a city's rows before reinserting). Local images expected at /home/locz/city-images/images/.
"""
import os, re, sqlite3, uuid, psycopg, boto3
from botocore.config import Config

ENV = open("/home/locz/app/.env").read()


def env(k, d=None):
    m = re.search(rf"^{k}=(.*)$", ENV, re.M)
    return (m.group(1).strip().strip('"').strip("'") if m else d)


s3 = boto3.client(
    "s3",
    endpoint_url=env("STORAGE_ENDPOINT"),
    aws_access_key_id=env("STORAGE_ACCESS_KEY_ID"),
    aws_secret_access_key=env("STORAGE_SECRET_ACCESS_KEY"),
    region_name=env("STORAGE_REGION", "us-east-1"),
    config=Config(s3={"addressing_style": "path"}),
)
BUCKET = env("STORAGE_BUCKET")
PUBLIC = env("STORAGE_PUBLIC_BASE_URL").rstrip("/")
IMG_ROOT = "/home/locz/city-images"  # holds images/<slug>/<file>

ALIAS = {"prayagraj": "allahabad", "delhi": "new-delhi", "gurugram": "gurgaon",
         "bokaro-steel-city": "bokaro", "hubballi-dharwad": "dharwad",
         "puducherry": "pondicherry", "kanpur": "kanpur-nagar",
         "bilaspur": "bilaspur-cgh"}

src = sqlite3.connect("/home/locz/locz_cities.db"); src.row_factory = sqlite3.Row
prod = psycopg.connect(open("/tmp/locz_dburl").read().strip(), connect_timeout=60)
by_slug = {r[0]: r[1] for r in prod.execute("SELECT slug, id FROM cities").fetchall()}
by_name = {}
for slug, name in prod.execute("SELECT slug, lower(name) FROM cities").fetchall():
    by_name.setdefault(name, by_slug[slug])


def attribution_for(im):
    if im["attribution"]:
        return im["attribution"]
    if im["kind"] == "HERO":
        return "Illustration generated for LocZ"
    if im["kind"] == "MAP":
        return "Map rendered from geoBoundaries (CC BY 4.0)"
    return None


uploaded = rows = skipped = 0
for city in src.execute("SELECT id, city_name, city_slug FROM cities").fetchall():
    pid = (by_slug.get(city["city_slug"]) or by_name.get((city["city_name"] or "").lower())
           or by_slug.get(ALIAS.get(city["city_slug"], "")))
    if not pid:
        continue
    imgs = src.execute(
        "SELECT kind,title,storage_url,source,license,attribution,width,height,content_hash "
        "FROM city_images WHERE city_id=? AND status IN ('GENERATED','PULLED','APPROVED') "
        "ORDER BY CASE kind WHEN 'HERO' THEN 0 WHEN 'MAP' THEN 1 ELSE 2 END, id",
        (city["id"],)).fetchall()

    prepared = []
    for i, im in enumerate(imgs):
        local = os.path.join(IMG_ROOT, im["storage_url"])
        if not os.path.exists(local):
            skipped += 1
            continue
        key = "city-images/" + im["storage_url"].replace("images/", "", 1)
        s3.upload_file(local, BUCKET, key,
                       ExtraArgs={"ContentType": "image/webp", "CacheControl": "public, max-age=31536000"})
        uploaded += 1
        prepared.append((str(uuid.uuid4()), pid, im["kind"], im["title"], f"{PUBLIC}/{key}",
                         im["source"], im["license"], attribution_for(im),
                         im["width"], im["height"], im["content_hash"], i))

    if prepared:
        with prod.cursor() as cur:
            cur.execute('DELETE FROM city_images WHERE "cityId"=%s', (pid,))
            cur.executemany(
                'INSERT INTO city_images ("id","cityId","kind","title","storageUrl","source",'
                '"license","attribution","width","height","contentHash","sortOrder") '
                'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)', prepared)
        prod.commit()
        rows += len(prepared)
        print(f"  {city['city_name']}: {len(prepared)} images", flush=True)

print(f"\nUploaded {uploaded} files, {rows} city_images rows, {skipped} missing.")
