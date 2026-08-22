#!/usr/bin/env python3
"""
LocZ business enrichment — resumable, DB-native, portable.

For EXISTING businesses only (never inserts). For each business missing a
description it:
  1. matches Overture Maps (local parquet) for phone / website / address
     — storage-safe, permissively licensed external data;
  2. generates a 2-sentence description + SEO keywords with Sarvam (India-tuned),
     using ONLY given facts (no invented phones/prices/claims);
  3. UPDATEs the row in place, committing every batch.

Resumable: it only picks rows where description IS NULL, so re-running (or running
from a different machine against the same prod DB) simply continues where it left
off. Safe to Ctrl-C at any time.

Requires env:  DATABASE_URL (prod Postgres)   SARVAM_KEY (sk_...)
Requires file: var/overture/india_places.parquet  (see ENRICHMENT.md step 2)
"""
import os, re, json, time, difflib, urllib.request
import duckdb
import psycopg  # psycopg 3

DATABASE_URL = os.environ["DATABASE_URL"]
SARVAM_KEY   = os.environ["SARVAM_KEY"]
PARQUET      = os.environ.get("OVERTURE_PARQUET", "var/overture/india_places.parquet")
BATCH        = int(os.environ.get("ENRICH_BATCH", "50"))
LIMIT        = int(os.environ.get("ENRICH_LIMIT", "0"))   # 0 = all remaining
SIM_MIN      = float(os.environ.get("ENRICH_SIM_MIN", "0.55"))

norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())


def fetch_businesses(cur, limit):
    """Rows still needing a description, newest-first, with coordinates."""
    cur.execute(
        """
        SELECT id, name, category, city, latitude, longitude,
               "primaryPhone", website
        FROM businesses
        WHERE description IS NULL
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        ORDER BY id
        LIMIT %s
        """,
        (limit,),
    )
    cols = [c.name for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def overture_match(con, b):
    """One ~300m spatial box, then fuzzy name match in python."""
    lat, lng = float(b["latitude"]), float(b["longitude"])
    rows = con.execute(
        f"""
        SELECT o.name,
               try_cast(o.phones[1]   AS VARCHAR),
               try_cast(o.websites[1] AS VARCHAR),
               o.addr_freeform
        FROM read_parquet('{PARQUET}') o
        WHERE o.lon BETWEEN {lng-0.003} AND {lng+0.003}
          AND o.lat BETWEEN {lat-0.003} AND {lat+0.003}
        """
    ).fetchall()
    best, best_sim = None, 0.0
    for oname, phone, website, addr in rows:
        sim = difflib.SequenceMatcher(None, norm(b["name"]), norm(oname)).ratio()
        if sim > best_sim:
            best_sim, best = sim, {"phone": phone, "website": website, "addr": addr}
    return best if best and best_sim >= SIM_MIN else None


def sarvam(b, retries=2):
    sys = ("You are LocZ writing a local business directory listing for SEO. Use ONLY the "
           "given facts (name, category, city). Do NOT invent phone numbers, prices, ratings, "
           "years or specific claims. Natural modern English. Output strict JSON only.")
    user = (f"Business: {b['name']}\nCategory: {b['category']}\nCity: {b['city']}\n\n"
            'Return JSON: {"description":"2 factual sentences on what this business is and where",'
            '"keywords":["6-8 search phrases people use"]}')
    body = json.dumps({
        "model": "sarvam-105b-conversations", "temperature": 0.3, "max_tokens": 500,
        "messages": [{"role": "system", "content": sys}, {"role": "user", "content": user}],
    }).encode()
    for _ in range(retries + 1):
        try:
            req = urllib.request.Request(
                "https://api.sarvam.ai/v1/chat/completions", body,
                {"Content-Type": "application/json", "Authorization": f"Bearer {SARVAM_KEY}"})
            j = json.load(urllib.request.urlopen(req, timeout=60))
            c = j["choices"][0]["message"]["content"] or ""
            g = json.loads(c[c.index("{"):c.rindex("}") + 1])
            if g.get("description"):
                return g
        except Exception:
            time.sleep(1.0)
    return None


def main():
    con = duckdb.connect()
    done = 0
    t0 = time.time()
    with psycopg.connect(DATABASE_URL) as pg:
        while True:
            take = BATCH if LIMIT == 0 else min(BATCH, LIMIT - done)
            if take <= 0:
                break
            with pg.cursor() as cur:
                batch = fetch_businesses(cur, take)
            if not batch:
                print("No more businesses need enrichment. Done.")
                break

            with pg.cursor() as cur:
                for b in batch:
                    g = sarvam(b)
                    if not g:
                        continue
                    m = overture_match(con, b)
                    sets = ["description = %s", "keywords = %s"]
                    vals = [g["description"], g.get("keywords", [])[:10]]
                    if m and m.get("phone") and not b.get("primaryPhone"):
                        sets.append('"primaryPhone" = %s'); vals.append(m["phone"])
                    if m and m.get("website") and not b.get("website"):
                        sets.append("website = %s"); vals.append(m["website"])
                    if m:
                        sets.append('"attributionText" = COALESCE("attributionText",\'\') '
                                    "|| ' Contact data via Overture Maps.'")
                    vals.append(b["id"])
                    cur.execute(
                        f'UPDATE businesses SET {", ".join(sets)} WHERE id = %s', vals)
                    done += 1
            pg.commit()
            rate = done / max(time.time() - t0, 1)
            print(f"  committed {done} businesses  ({rate:.1f}/s)")
    print(f"Enriched {done} businesses in {int(time.time()-t0)}s.")


if __name__ == "__main__":
    main()
