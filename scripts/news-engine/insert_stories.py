"""VPS receiver: read a JSON array of LocZ engine stories from stdin, upsert into news_stories.
Computes an SEO slug (title + short hash) per story."""
import sys, re, json, psycopg
rows = json.load(sys.stdin)
c = psycopg.connect(open("/tmp/locz_dburl").read().strip(), connect_timeout=60)
cols = ["content_hash","slug","category","title_en","dek_en","body_en","title_hi","body_hi",
        "title_te","body_te","state_lang","title_sl","body_sl","image_url","image_credit",
        "city","state","latitude","longitude","src_url","src_publisher","src_lang",
        "published_at","status"]


def slugify(title, ch):
    s = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")[:60].strip("-")
    return f"{s}-{ch[:8]}" if s else ch


ins = 0
with c.cursor() as cur:
    for r in rows:
        r.setdefault("slug", slugify(r.get("title_en"), r.get("content_hash", "")))
        vals = [r.get(k) for k in cols]
        cur.execute(
            f'INSERT INTO news_stories ({",".join(cols)}) VALUES ({",".join(["%s"]*len(cols))}) '
            'ON CONFLICT (content_hash) DO NOTHING', vals)
        ins += cur.rowcount
c.commit()
print(f"inserted {ins} new stories ({len(rows)} received)")
