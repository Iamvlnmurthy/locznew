-- 7th CPC HRA tier on cities: 1 = Tier 1 (X), 2 = Tier 2 (Y), 3 = Tier 3 (Z).
-- Only the column is added here; the values are derived by name-match against the X/Y lists in
-- prisma/seed-city-tiers.ts (re-runnable, creates no cities). IF NOT EXISTS keeps this a no-op
-- where the column was already applied directly.
ALTER TABLE "cities" ADD COLUMN IF NOT EXISTS "tier" INTEGER;
CREATE INDEX IF NOT EXISTS "cities_tier_idx" ON "cities" ("tier");
