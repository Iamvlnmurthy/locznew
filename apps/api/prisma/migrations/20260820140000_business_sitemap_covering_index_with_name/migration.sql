-- The sitemap now excludes imported non-businesses (civic POIs, placeholder/short names) via a
-- name filter. To keep the shard cursor + slug queries index-only (a name filter that hit the heap
-- would re-introduce the crawler fetch timeout), the covering index must also carry `name`.
--
-- Replaces businesses_sitemap_cov_idx (id INCLUDE slug, updatedAt) with a variant that also
-- INCLUDEs name. IF NOT EXISTS / IF EXISTS so it is a no-op where already applied concurrently in
-- production. Non-concurrent here because Prisma runs each migration in a transaction; on a
-- fresh/empty DB the lock is momentary.
CREATE INDEX IF NOT EXISTS "businesses_sitemap_cov2_idx" ON "businesses" ("id")
INCLUDE ("slug", "updatedAt", "name")
WHERE "deletedAt" IS NULL
  AND "isActive"
  AND (
    "claimStatus" = 'CLAIMED'
    OR "verificationStatus" = 'VERIFIED'
    OR "primaryPhone" IS NOT NULL
    OR "description" IS NOT NULL
  );

DROP INDEX IF EXISTS "businesses_sitemap_cov_idx";
