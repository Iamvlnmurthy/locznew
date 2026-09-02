"""Authoritatively (re)assign EVERY prod news_stories image from the shared news_image_map.

Recomputes each story's image = topic image if the headline matches a topic that has a pool, else a
deterministic category image. Because it is authoritative, narrowing a keyword (e.g. dropping
"celebrat" from festival) correctly RESETS a wrongly-matched story back to its category image, and
adding a keyword upgrades a previously-missed story -- in one pass. Matches engine.py exactly
(both call nim.image_for). Only rows whose image actually changes are written.

Run:  python backfill_news_images.py            # apply
      python backfill_news_images.py --dry       # show what would change
"""
import os, sys, json, subprocess
import news_image_map as nim

HERE = os.path.dirname(os.path.abspath(__file__))
POOL = nim.load_pool(os.path.join(HERE, "news-images"))
DRY = "--dry" in sys.argv

# Pull id, title, category, current image from prod as JSON (tab separators don't survive ssh quoting).
import json as _json
q = ("SELECT coalesce(json_agg(json_build_object('id',id,'t',coalesce(title_en,''),"
     "'c',category,'u',image_url)),'[]') FROM news_stories;")
raw = subprocess.run(["ssh", "onrol", "docker exec -i locz-postgres psql -U locz -d locz -t -A"],
                     input=q.encode("utf-8"), capture_output=True, timeout=120).stdout.decode("utf-8", "replace")

rows = []
for r in _json.loads(raw.strip() or "[]"):
    sid, title, cat, cur = r["id"], r["t"] or "", r["c"] or "", r.get("u") or ""
    url = nim.image_for(POOL, title, cat, key=sid.replace("-", ""))
    if url != cur:                                   # only write real changes
        topic = nim.topic_of(title) or cat
        rows.append((sid, url, topic))

print(f"{len(rows)} stories will change image", end="")
if not rows:
    print(" -- everything already correct.")
    sys.exit(0)
by_topic = {}
for _, _, t in rows:
    by_topic[t] = by_topic.get(t, 0) + 1
print(":", by_topic)
if DRY:
    sys.exit(0)

values = ",".join(f"('{sid}','{url}')" for sid, url, _ in rows)
sql = (f"UPDATE news_stories s SET image_url=v.u, image_credit=NULL "
       f"FROM (VALUES {values}) v(id,u) WHERE s.id=v.id::uuid;\n")
p = subprocess.run(["ssh", "onrol", "docker exec -i locz-postgres psql -U locz -d locz"],
                   input=sql.encode("utf-8"), capture_output=True, timeout=180)
sys.stdout.write(p.stdout.decode("utf-8", "replace"))
sys.stderr.write(p.stderr.decode("utf-8", "replace"))
