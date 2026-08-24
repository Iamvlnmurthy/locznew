"""VPS receiver: read a JSON array of LocZ engine stories from stdin, upsert into news_stories."""
import sys, json, psycopg
rows = json.load(sys.stdin)
c = psycopg.connect(open("/tmp/locz_dburl").read().strip(), connect_timeout=60)
cols = ["content_hash","category","title_en","dek_en","body_en","title_hi","body_hi",
        "title_te","body_te","state_lang","title_sl","body_sl","image_url","image_credit",
        "city","state","latitude","longitude","src_url","src_publisher","src_lang",
        "published_at","status"]
ins = 0
with c.cursor() as cur:
    for r in rows:
        vals = [r.get(k) for k in cols]
        cur.execute(
            f'INSERT INTO news_stories ({",".join(cols)}) VALUES ({",".join(["%s"]*len(cols))}) '
            'ON CONFLICT (content_hash) DO NOTHING', vals)
        ins += cur.rowcount
c.commit()
print(f"inserted {ins} new stories ({len(rows)} received)")
