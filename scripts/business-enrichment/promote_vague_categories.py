"""Promote businesses out of "Other local businesses" where the directory already knows better.

When the same business name in the same city is filed both as the vague fallback and as
exactly one specific category, the specific one is the answer and the vague record is simply
the one the import failed to place. This moves it.

Why this is worth doing when merging duplicates was not: "Other local businesses" is
definitionally useless to a reader — it says only that the thing is a business — so a
plausible-but-imperfect specific category is an improvement even when it is wrong. Merging
a duplicate destroys a page; this only relabels one, and the label being replaced carries no
information.

It is the inverse of a rule already in the enrichment log: *never move a business into
"Other local businesses"*. A vague category is worse than an imperfect specific one.

Guards:

  - `ownerId IS NULL` — a claimed business is never overruled.
  - exactly one specific category among the namesakes, so an ambiguous group is skipped.
    That is what excludes "Surabhi", which spans a pharmacy, a restaurant and a fallback.
  - every previous value is written to `category_promotion_log` first, so the whole change
    can be reversed with one UPDATE ... FROM.
  - applied in batches with a commit between, because a single UPDATE over thousands of rows
    holds locks that block the live site's own writes.

    python scripts/business-enrichment/promote_vague_categories.py          # dry run
    python scripts/business-enrichment/promote_vague_categories.py apply
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _db  # noqa: E402

_db.utf8_stdout()
APPLY = "apply" in sys.argv
BATCH = 500

CANDIDATES = """
WITH grp AS (
  SELECT lower(btrim(b.name)) AS n,
         b."cityId" AS city,
         count(*) FILTER (WHERE c.name = 'Other local businesses') AS vague,
         count(DISTINCT c.id) FILTER (WHERE c.name <> 'Other local businesses') AS distinct_specific,
         -- Guaranteed to be exactly one by the HAVING clause below; max() has no
         -- uuid overload, so aggregate the ids and take the first.
         (array_agg(DISTINCT c.id) FILTER (WHERE c.name <> 'Other local businesses'))[1]
           AS target_id
  FROM businesses b
  JOIN categories c ON c.id = b."categoryId"
  WHERE b."deletedAt" IS NULL AND b."isActive" AND b."ownerId" IS NULL
    AND char_length(btrim(b.name)) > 6
  GROUP BY 1, 2
  HAVING count(*) FILTER (WHERE c.name = 'Other local businesses') > 0
     AND count(DISTINCT c.id) FILTER (WHERE c.name <> 'Other local businesses') = 1
)
SELECT b.id, b."categoryId" AS from_id, grp.target_id
FROM businesses b
JOIN categories c ON c.id = b."categoryId"
JOIN grp ON grp.n = lower(btrim(b.name)) AND grp.city = b."cityId"
WHERE c.name = 'Other local businesses'
  AND b."deletedAt" IS NULL AND b."isActive" AND b."ownerId" IS NULL
"""


def main():
    conn = _db.connect(statement_timeout="600s", work_mem="64MB", autocommit=True)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS category_promotion_log (
          business_id  uuid PRIMARY KEY,
          from_id      uuid NOT NULL,
          to_id        uuid NOT NULL,
          moved_at     timestamptz NOT NULL DEFAULT now()
        )""")

    print("finding candidates…", flush=True)
    cur.execute(CANDIDATES)
    rows = cur.fetchall()
    print(f"{len(rows):,} businesses to promote")

    if not APPLY:
        print("\nDRY RUN — nothing written. Re-run with 'apply'.")
        conn.close()
        return

    done = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        cur.executemany(
            """INSERT INTO category_promotion_log (business_id, from_id, to_id)
               VALUES (%s, %s, %s) ON CONFLICT (business_id) DO NOTHING""",
            [(r[0], r[1], r[2]) for r in chunk],
        )
        cur.executemany(
            'UPDATE businesses SET "categoryId" = %s, "updatedAt" = now() WHERE id = %s',
            [(r[2], r[0]) for r in chunk],
        )
        done += len(chunk)
        if done % 2000 == 0 or done == len(rows):
            print(f"  {done:,}/{len(rows):,}", flush=True)

    cur.execute("SELECT count(*) FROM category_promotion_log")
    print(f"\npromoted {done:,}; {cur.fetchone()[0]:,} rows in category_promotion_log")
    print("\nTo reverse:")
    print('  UPDATE businesses b SET "categoryId" = l.from_id')
    print("    FROM category_promotion_log l WHERE l.business_id = b.id;")
    conn.close()


if __name__ == "__main__":
    main()
