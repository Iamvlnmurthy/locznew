-- Moderator takedown for auto-ingested news. Soft (nullable timestamp + who), so a removal is
-- reversible and the retention purge still deletes the row on schedule. The feed and detail
-- queries exclude events where removedAt IS NOT NULL. Nullable => instant on the small news table.
ALTER TABLE "NewsEvent" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);
ALTER TABLE "NewsEvent" ADD COLUMN IF NOT EXISTS "removedBy" UUID;
