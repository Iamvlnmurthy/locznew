"""VPS-side I/O for the one-off modern-Telugu backfill. Two modes:

    dump   -> print JSON [{id,title_te,dek_te,body_te}] for every story that has Telugu.
    apply  -> read JSON [{id,title_te,dek_te,body_te}] from stdin, UPDATE those rows.

Refinement itself happens on the LOCAL GPU box (it holds the Gemini key + internet); this script
only reads and writes the prod DB, reusing the same connection file as insert_stories.py.
"""
import sys, json, psycopg

DSN = open("/tmp/locz_dburl").read().strip()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    c = psycopg.connect(DSN, connect_timeout=60)
    if mode == "dump":
        with c.cursor() as cur:
            cur.execute("SELECT id::text, title_te, dek_te, body_te FROM news_stories "
                        "WHERE title_te IS NOT NULL ORDER BY id")
            rows = [{"id": r[0], "title_te": r[1], "dek_te": r[2], "body_te": r[3]}
                    for r in cur.fetchall()]
        sys.stdout.write(json.dumps(rows, ensure_ascii=False))
        return
    if mode == "apply":
        rows = json.load(sys.stdin)
        n = 0
        with c.cursor() as cur:
            for r in rows:
                # Never write an empty value over a real one — only update fields we actually refined.
                cur.execute(
                    "UPDATE news_stories SET "
                    "title_te = COALESCE(%s, title_te), "
                    "dek_te   = COALESCE(%s, dek_te), "
                    "body_te  = COALESCE(%s, body_te) "
                    "WHERE id = %s::uuid",
                    (r.get("title_te"), r.get("dek_te"), r.get("body_te"), r.get("id")))
                n += cur.rowcount
        c.commit()
        print(f"updated {n} rows ({len(rows)} received)")
        return
    sys.exit("usage: te_modern_io.py dump|apply")


if __name__ == "__main__":
    main()
