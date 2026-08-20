-- Covering variant of the curated business sitemap index. The sitemap shards paginate with
-- OFFSET, so a deep shard (e.g. OFFSET 1,000,000) makes the plain "(id)" index skip a million
-- rows via random heap lookups (~90s). INCLUDE (slug, updatedAt) lets the skip + fetch run as a
-- sequential index-only scan (no heap), keeping even the deepest shard a few seconds so Google can
-- fetch every shard within its timeout.
--
-- IF NOT EXISTS so it is a no-op where the index was already created concurrently in production.
-- Kept non-concurrent here because Prisma runs each migration in a transaction (CREATE INDEX
-- CONCURRENTLY cannot); on a fresh/empty DB the lock is momentary.
CREATE INDEX IF NOT EXISTS "businesses_sitemap_cov_idx" ON "businesses" ("id")
INCLUDE ("slug", "updatedAt")
WHERE "deletedAt" IS NULL
  AND "isActive"
  AND (
    "claimStatus" = 'CLAIMED'
    OR "verificationStatus" = 'VERIFIED'
    OR "primaryPhone" IS NOT NULL
    OR "description" IS NOT NULL
  );

-- The non-covering "(id)"-only predecessor is now redundant: the covering index has the same key
-- and predicate, so it serves everything the old one did plus the index-only shard reads. Drop it
-- so the planner can't pick the heap-touching scan (and it doesn't waste write bandwidth).
DROP INDEX IF EXISTS "businesses_sitemap_idx";
