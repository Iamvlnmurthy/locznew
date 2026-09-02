"""Upgrade EXISTING prod news_stories to topic-matched images as the topic library fills.

Only rows whose headline maps to a topic that HAS images are changed -- every other row keeps its
current (publish-order-rotated) category image, so this never re-introduces the side-by-side dups
and is a clean no-op until topics exist. Uses the shared news_image_map so it matches engine.py
exactly. Idempotent: safe to re-run after every refresh.

Run:  python backfill_news_images.py            # apply
      python backfill_news_images.py --dry       # show counts only
"""
import os, sys, json, subprocess
import news_image_map as nim

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = nim.load_pool(os.path.join(HERE, "news-images"))
DRY = "--dry" in sys.argv

# Pull id, title, category from prod.
q = "SELECT id, coalesce(title_en,''), category FROM news_stories;"
raw = subprocess.check_output(
    ["ssh", "onrol", f"docker exec locz-postgres psql -U locz -d locz -At -F'\\t' -c \"{q}\""],
    timeout=120).decode("utf-8", "replace")

rows = []
for line in raw.splitlines():
    if not line.strip():
        continue
    sid, title, cat = (line.split("\t") + ["", "", ""])[:3]
    topic = nim.topic_of(title)
    if not topic or not POOL.get(f"t-{topic}"):
        continue                                   # no topic image -> leave the category rotation as-is
    url = nim.image_for(POOL, title, cat, key=sid.replace("-", ""))
    if url.startswith(f"/news-images/t-{topic}-"):  # only when it actually resolved to the topic image
        rows.append((sid, url, topic))

print(f"{len(rows)} stories match a topic that has images", end="")
if not rows:
    print(" -- nothing to upgrade yet (build topic pools first with refresh_news_images.py).")
    sys.exit(0)
by_topic = {}
for _, _, t in rows:
    by_topic[t] = by_topic.get(t, 0) + 1
print(":", by_topic)
if DRY:
    sys.exit(0)

values = ",".join(f"('{sid}','{url}')" for sid, url, _ in rows)
sql = (f"UPDATE news_stories s SET image_url=v.u, image_credit=NULL "
       f"FROM (VALUES {values}) v(id,u) WHERE s.id=v.id::uuid;")
p = subprocess.run(["ssh", "onrol",
                    "docker exec -i locz-postgres psql -U locz -d locz -c \"" + sql + "\""],
                   capture_output=True, timeout=180)
sys.stdout.write(p.stdout.decode("utf-8", "replace"))
sys.stderr.write(p.stderr.decode("utf-8", "replace"))
