-- Social profiles carried by imported records, emitted as schema.org sameAs.
--
-- A constant default, so Postgres records it in the catalogue instead of rewriting three and
-- a half million rows. Without that this statement is a full table rewrite and a long lock.
ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "socialLinks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Every URL a business has ever had, so re-slugging does not 404 the indexed web.
CREATE TABLE IF NOT EXISTS "business_slug_aliases" (
  "slug"       VARCHAR(200) NOT NULL,
  "businessId" UUID         NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_slug_aliases_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX IF NOT EXISTS "business_slug_aliases_businessId_idx"
  ON "business_slug_aliases" ("businessId");

-- NOT VALID keeps this from scanning the whole businesses table while holding a lock; the
-- rows are written by us and are correct by construction. VALIDATE below takes only a
-- ROW SHARE lock and lets concurrent writes through.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_slug_aliases_businessId_fkey') THEN
    ALTER TABLE "business_slug_aliases"
      ADD CONSTRAINT "business_slug_aliases_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
    ALTER TABLE "business_slug_aliases" VALIDATE CONSTRAINT "business_slug_aliases_businessId_fkey";
  END IF;
END $$;
