"""One-time cleanup: find and demote already-published near-duplicate news_stories.

Reuses the exact same detection logic insert_stories.py uses going forward (is_near_duplicate),
so a story that would be rejected as a duplicate today is treated the same way retroactively.
Demotes losers to status='DUPLICATE' rather than deleting -- stories.service.ts's public feed
already filters to status='PUBLISHED', so this removes them from the feed immediately, keeps
the row (and its view_count, audit trail) intact, and is trivially reversible.

Scope, to stay safe: only compares stories in the SAME city published within 3 days of each
other -- the same window is_near_duplicate uses live, so this can't merge two stories a human
reviewing the cleanup wouldn't also recognise as the same event.

Run:  python cleanup_duplicate_stories.py --dry       # show what would be demoted
      python cleanup_duplicate_stories.py              # apply
"""
import sys, io, json, subprocess
from datetime import datetime
from insert_stories import text_similarity

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DRY = "--dry" in sys.argv


def fetch_candidates():
    q = (
        "SELECT json_agg(json_build_object("
        "'id', id, 'title', title_en, 'dek', dek_en, 'body', body_en, "
        "'city', city, 'published_at', published_at, 'status', status"
        ")) FROM news_stories WHERE status = 'PUBLISHED';"
    )
    raw = subprocess.run(
        ["ssh", "onrol", "docker exec -i locz-postgres psql -U locz -d locz -t -A"],
        input=q.encode("utf-8"), capture_output=True, timeout=120,
    ).stdout.decode("utf-8", "replace")
    return json.loads(raw.strip() or "[]")


def is_same_event(a, b):
    # Title-only, >0.5 -- the ORIGINAL check, already proven safe at live-ingest volume.
    #
    # The amount+weak-body-similarity heuristic from is_near_duplicate was tried here too and
    # pulled in from this run: it correctly caught the real cosmetics-raid cluster this script
    # was built for, but ALSO merged wholly unrelated stories (a VIP-voter-roll story, a cricket
    # report, a monsoon forecast) under one unrelated "keeper". All Hyderabad stories pass through
    # the same AI rewrite pipeline in a consistent house style ("On Wednesday, officials..."), and
    # at corpus scale that shared STYLE -- not shared content -- crossed the 0.10 body-similarity
    # floor for pairs that calibrating against only 3 real examples never surfaced. Not safe to
    # run unattended; the cosmetics cluster is instead handled as an explicit, named one-off.
    return text_similarity(a["title"] or "", b["title"] or "") > 0.5


def main():
    rows = fetch_candidates()
    by_city = {}
    for r in rows:
        by_city.setdefault(r["city"] or "", []).append(r)

    to_demote = []  # (loser_id, winner_id, loser_title)
    for city, group in by_city.items():
        if not city or len(group) < 2:
            continue
        group.sort(key=lambda r: r["published_at"])  # earliest first = keeper
        demoted_ids = set()
        for i, a in enumerate(group):
            if a["id"] in demoted_ids:
                continue
            a_date = datetime.fromisoformat(a["published_at"].replace("Z", "+00:00"))
            for b in group[i + 1 :]:
                if b["id"] in demoted_ids:
                    continue
                b_date = datetime.fromisoformat(b["published_at"].replace("Z", "+00:00"))
                if (b_date - a_date).days > 3:
                    break  # sorted by date; nothing further in range either
                if is_same_event(a, b):
                    to_demote.append((b["id"], a["id"], b["title"]))
                    demoted_ids.add(b["id"])

    print(f"{len(to_demote)} stories will be demoted to status='DUPLICATE':")
    for loser_id, winner_id, title in to_demote:
        print(f"  {title!r}  (kept: {winner_id})")

    if not to_demote or DRY:
        return

    ids = ",".join(f"'{lid}'" for lid, _, _ in to_demote)
    sql = f"UPDATE news_stories SET status='DUPLICATE' WHERE id IN ({ids});\n"
    p = subprocess.run(
        ["ssh", "onrol", "docker exec -i locz-postgres psql -U locz -d locz"],
        input=sql.encode("utf-8"), capture_output=True, timeout=180,
    )
    sys.stdout.write(p.stdout.decode("utf-8", "replace"))
    sys.stderr.write(p.stderr.decode("utf-8", "replace"))


if __name__ == "__main__":
    main()
