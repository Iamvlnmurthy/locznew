-- Partial index powering the curated business sitemap (/sitemap-businesses.xml): an ordered scan
-- of only the businesses with real substance. IF NOT EXISTS so it is a no-op where the index was
-- already created concurrently in production. Kept non-concurrent here because Prisma runs each
-- migration in a transaction (CREATE INDEX CONCURRENTLY cannot); on a fresh/empty DB the lock is
-- momentary.
CREATE INDEX IF NOT EXISTS "businesses_sitemap_idx" ON "businesses" ("id")
WHERE "deletedAt" IS NULL
  AND "isActive"
  AND (
    "claimStatus" = 'CLAIMED'
    OR "verificationStatus" = 'VERIFIED'
    OR "primaryPhone" IS NOT NULL
    OR "description" IS NOT NULL
  );
