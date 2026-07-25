-- Every Indian postal code, so the platform works outside the launched cities.
--
-- NOTE: `prisma migrate diff` proposes dropping the GiST, trigram and partial indexes on
-- every run, because they live in raw SQL rather than in schema.prisma (ADR-0003). Those
-- DROP INDEX statements were removed from this file by hand and must be removed from any
-- future generated migration too. `scripts/verify-db.sh` catches it if they are not.

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "pincodeCode" VARCHAR(6);

-- CreateTable
CREATE TABLE "pincodes" (
    "code" VARCHAR(6) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "districtName" VARCHAR(120) NOT NULL,
    "stateName" VARCHAR(120) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "geo" geography(Point, 4326),
    "officeCount" INTEGER NOT NULL DEFAULT 1,
    "cityId" UUID,
    "isServiceable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pincodes_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "pincodes_name_idx" ON "pincodes"("name");

-- CreateIndex
CREATE INDEX "pincodes_districtName_idx" ON "pincodes"("districtName");

-- CreateIndex
CREATE INDEX "pincodes_stateName_idx" ON "pincodes"("stateName");

-- CreateIndex
CREATE INDEX "pincodes_cityId_idx" ON "pincodes"("cityId");

-- CreateIndex
CREATE INDEX "listings_pincodeCode_status_publishedAt_idx" ON "listings"("pincodeCode", "status", "publishedAt" DESC);

-- AddForeignKey
ALTER TABLE "pincodes" ADD CONSTRAINT "pincodes_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_pincodeCode_fkey" FOREIGN KEY ("pincodeCode") REFERENCES "pincodes"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- What Prisma cannot express, added by hand — the same treatment every other
-- geography column gets.
-- ---------------------------------------------------------------------

-- Without this, resolving a pincode to nearby listings is a sequential scan.
CREATE INDEX IF NOT EXISTS "pincodes_geo_gist_idx" ON "pincodes" USING GIST ("geo");

-- Typeahead on a partial code: "5000…" must match without a leading-wildcard seq scan.
CREATE INDEX IF NOT EXISTS "pincodes_code_trgm_idx" ON "pincodes" USING GIN ("code" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "pincodes_name_trgm_idx" ON "pincodes" USING GIN ("name" gin_trgm_ops);

-- Derives `geo` from the coordinates, exactly as for cities and listings. Omitting this
-- would leave every pincode with a null geography and no radius search would ever match.
CREATE TRIGGER "pincodes_geo_sync"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "pincodes"
  FOR EACH ROW EXECUTE FUNCTION locz_sync_geo();
