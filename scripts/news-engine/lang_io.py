"""VPS-side I/O for the modern-language backfill, generalised over language column-sets.

    dump  <suffix> [state_lang_csv]   -> JSON [{id,state_lang,title,dek,body}] for rows that have
                                          title_<suffix>; optional state_lang filter (comma list).
    apply <suffix>                    -> read JSON [{id,title,dek,body}] from stdin, UPDATE those.

suffix is 'hi' (Hindi columns), 'te' (Telugu columns) or 'sl' (generic state-language columns).
Refinement runs on the LOCAL box; this only reads/writes prod (same connection file as the engine).
"""
import sys, json, psycopg

DSN = open("/tmp/locz_dburl").read().strip()
COLS = {"hi": ("title_hi", "dek_hi", "body_hi"),
        "te": ("title_te", "dek_te", "body_te"),
        "sl": ("title_sl", "dek_sl", "body_sl")}


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    suffix = sys.argv[2] if len(sys.argv) > 2 else ""
    if suffix not in COLS:
        sys.exit("usage: lang_io.py dump|apply <hi|te|sl> [state_lang_csv]")
    t, d, b = COLS[suffix]
    c = psycopg.connect(DSN, connect_timeout=60)
    if mode == "dump":
        where = f"{t} IS NOT NULL"
        args = []
        if len(sys.argv) > 3 and sys.argv[3].strip():
            langs = [x.strip() for x in sys.argv[3].split(",") if x.strip()]
            where += " AND state_lang = ANY(%s)"
            args.append(langs)
        with c.cursor() as cur:
            cur.execute(f"SELECT id::text, state_lang, {t}, {d}, {b} FROM news_stories "
                        f"WHERE {where} ORDER BY id", args)
            rows = [{"id": r[0], "state_lang": r[1], "title": r[2], "dek": r[3], "body": r[4]}
                    for r in cur.fetchall()]
        sys.stdout.write(json.dumps(rows, ensure_ascii=False))
        return
    if mode == "apply":
        rows = json.load(sys.stdin)
        n = 0
        with c.cursor() as cur:
            for r in rows:
                cur.execute(
                    f"UPDATE news_stories SET {t}=COALESCE(%s,{t}), {d}=COALESCE(%s,{d}), "
                    f"{b}=COALESCE(%s,{b}) WHERE id=%s::uuid",
                    (r.get("title"), r.get("dek"), r.get("body"), r.get("id")))
                n += cur.rowcount
        c.commit()
        print(f"updated {n} rows ({len(rows)} received)")
        return
    sys.exit("usage: lang_io.py dump|apply <hi|te|sl> [state_lang_csv]")


if __name__ == "__main__":
    main()
