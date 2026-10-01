"""VPS receiver: read a JSON array of LocZ engine stories from stdin, upsert into news_stories.
Computes an SEO slug (title + short hash) per story."""
import sys, re, json, psycopg

AMOUNT_RE = re.compile(r"(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|crore|thousand)?", re.I)


def amount_keys(text):
    """Normalized value+unit for every rupee figure mentioned, e.g. {'7lakh'}."""
    out = set()
    for m in AMOUNT_RE.finditer(text or ""):
        out.add(f"{m.group(1).replace(',', '')}{(m.group(2) or '').lower()}")
    return out


def trigrams(s):
    # Approximates postgres pg_trgm's similarity() (2-before/1-after space padding, 3-char
    # shingles, Jaccard) closely enough for a WEAK corroboration check -- measured against the
    # real psql values for the three headlines this was built against, this under-counts by
    # ~0.05 (pg_trgm's exact algorithm has further internal rules not worth replicating here).
    # Not used as a precise threshold on its own; is_near_duplicate() keeps its floor low and
    # treats a shared amount as the real signal, this only guards against bare coincidence.
    s = (s or "").strip().lower()
    if not s:
        # A blank field (many stories have no dek) must never produce a trigram at all -- padding
        # it anyway makes every blank field match every OTHER blank field at 100% similarity,
        # which would corroborate a duplicate between two stories that share nothing but both
        # being missing a dek.
        return set()
    s = f"  {s} "
    return {s[i : i + 3] for i in range(len(s) - 2)}


def text_similarity(a, b):
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def is_near_duplicate(cur, title, dek, body, city):
    """True if a recent (3-day), same-city story is almost certainly the same real event.

    Plain headline-trigram similarity misses most same-event reworded coverage: four real outlets'
    headlines on one Rs 7 lakh Hyderabad cosmetics raid (2 Oct 2026) scored only 0.20-0.45, all
    below the 0.5 bar this started with -- and their dek/body text fared no better (0.13-0.39),
    too close to what two genuinely different local crime stories can score by chance to raise
    that bar safely. But the concrete rupee figure a story is about repeats verbatim across every
    outlet's body even when every surrounding sentence is reworded, so a shared amount plus a
    same city is a far more reliable same-event signal -- corroborated by at least weak textual
    echo so a coincidentally-shared round number (a common fine amount, say) can't match alone.
    """
    cur.execute(
        "SELECT 1 FROM news_stories WHERE created_at > now() - interval '3 days' "
        "AND similarity(lower(title_en), lower(%s)) > 0.5 LIMIT 1",
        (title,),
    )
    if cur.fetchone():
        return True

    new_amounts = amount_keys(title) | amount_keys(dek) | amount_keys(body)
    if not new_amounts or not city:
        return False

    cur.execute(
        "SELECT title_en, dek_en, body_en FROM news_stories "
        "WHERE created_at > now() - interval '3 days' AND city = %s",
        (city,),
    )
    for other_title, other_dek, other_body in cur.fetchall():
        other_amounts = amount_keys(other_title) | amount_keys(other_dek) | amount_keys(other_body)
        if not (new_amounts & other_amounts):
            continue
        if (
            text_similarity(title, other_title) > 0.10
            or text_similarity(dek, other_dek) > 0.10
            or text_similarity(body, other_body) > 0.10
        ):
            return True
    return False


def slugify(title, ch):
    s = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")[:60].strip("-")
    return f"{s}-{ch[:8]}" if s else ch


COLS = [
    "content_hash", "slug", "category", "title_en", "dek_en", "body_en", "title_hi", "body_hi",
    "title_te", "body_te", "dek_hi", "dek_te", "dek_sl", "state_lang", "title_sl", "body_sl",
    "image_url", "image_credit", "city", "state", "latitude", "longitude", "src_url",
    "src_publisher", "src_lang", "published_at", "status",
]


def main():
    rows = json.load(sys.stdin)
    conn = psycopg.connect(open("/tmp/locz_dburl").read().strip(), connect_timeout=60)
    ins = near_dup = 0
    with conn.cursor() as cur:
        for r in rows:
            title = (r.get("title_en") or "").strip()
            dek = r.get("dek_en") or ""
            body = r.get("body_en") or ""
            city = r.get("city") or ""
            if title and is_near_duplicate(cur, title, dek, body, city):
                near_dup += 1
                continue
            r.setdefault("slug", slugify(r.get("title_en"), r.get("content_hash", "")))
            vals = [r.get(k) for k in COLS]
            cur.execute(
                f'INSERT INTO news_stories ({",".join(COLS)}) VALUES ({",".join(["%s"] * len(COLS))}) '
                "ON CONFLICT (content_hash) DO NOTHING",
                vals,
            )
            ins += cur.rowcount
    conn.commit()
    print(f"inserted {ins} new stories ({len(rows)} received, {near_dup} near-duplicate skipped)")


if __name__ == "__main__":
    main()
