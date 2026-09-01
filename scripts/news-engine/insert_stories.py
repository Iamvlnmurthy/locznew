"""VPS receiver: read a JSON array of LocZ engine stories from stdin, upsert into news_stories.
Computes an SEO slug (title + short hash) per story."""
import sys, re, json, psycopg
rows = json.load(sys.stdin)
c = psycopg.connect(open("/tmp/locz_dburl").read().strip(), connect_timeout=60)
cols = ["content_hash","slug","category","title_en","dek_en","body_en","title_hi","body_hi",
        "title_te","body_te","dek_hi","dek_te","dek_sl","state_lang","title_sl","body_sl",
        "image_url","image_credit","city","state","latitude","longitude","src_url",
        "src_publisher","src_lang","published_at","status"]


def slugify(title, ch):
    s = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")[:60].strip("-")
    return f"{s}-{ch[:8]}" if s else ch


ins = 0
near_dup = 0
with c.cursor() as cur:
    for r in rows:
        title = (r.get("title_en") or "").strip()
        # Near-duplicate guard. ON CONFLICT (content_hash) only catches the SAME normalized headline,
        # but the same event often arrives with a reworded title (different feed, different rewrite).
        # Skip if a trigram-similar headline was published in the last 3 days — this is the main
        # defence against posting the same story twice (and against scaled/duplicate-content signals).
        if title:
            cur.execute(
                "SELECT 1 FROM news_stories WHERE created_at > now() - interval '3 days' "
                "AND similarity(lower(title_en), lower(%s)) > 0.5 LIMIT 1",
                (title,))
            if cur.fetchone():
                near_dup += 1
                continue
        r.setdefault("slug", slugify(r.get("title_en"), r.get("content_hash", "")))
        vals = [r.get(k) for k in cols]
        cur.execute(
            f'INSERT INTO news_stories ({",".join(cols)}) VALUES ({",".join(["%s"]*len(cols))}) '
            'ON CONFLICT (content_hash) DO NOTHING', vals)
        ins += cur.rowcount
c.commit()
print(f"inserted {ins} new stories ({len(rows)} received, {near_dup} near-duplicate skipped)")
