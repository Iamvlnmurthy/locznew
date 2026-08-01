-- Gives businesses and sellers a type, and lets a business exist without an owner.
--
-- Two problems, one change. The product needs home businesses to have a proper identity
-- rather than looking like random classified sellers -- a home baker, a kirana store and a
-- wholesaler need different forms, badges and search treatment, and none of that is
-- expressible while they are all just "a business". Separately, the pincode business-data
-- engine cannot import a single record until a business can exist unowned.
--
-- `ownerId` becomes nullable rather than pointing at a placeholder user. A fake owner is a
-- lie the rest of the platform then has to work around, and `ownerId IS NULL` is exactly
-- the "unclaimed" query. `claimStatus` says out loud what the record is: LocZ knows the shop
-- exists because an open dataset said so, and nobody from that shop has ever logged in.
--
-- Provenance columns are not bookkeeping. ODbL and CDLA both require attribution to travel
-- with the data, so importing without them would breach the licence, and a record whose
-- source is unknown cannot be defended if somebody disputes it. The unique index on
-- (sourceName, sourceRecordId) means a re-run of an import cannot duplicate a record.
--
-- `pincodeCode` because cities here are districts, so a city alone cannot answer "what is in
-- 500081" -- which is the unit people actually search by, and the engine's entire unit of work.
--
-- Known follow-up, deliberately not solved here: the owner foreign key now nulls on delete,
-- so a hard-deleted user would leave a business with no owner still marked OWNER_CREATED.
-- Users are soft-deleted in practice, so this does not fire today; making it set UNCLAIMED
-- belongs with the account-deletion path rather than in a schema migration.
--
-- Additive and defaulted throughout: existing businesses become RETAIL_STORE / OWNER_CREATED,
-- existing users INDIVIDUAL. Nothing changes behaviour until code reads these.

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RETAIL_STORE', 'HOME_BUSINESS', 'SERVICE_PROVIDER', 'PROFESSIONAL', 'MANUFACTURER', 'WHOLESALER', 'DEALER', 'OTHER');

-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('INDIVIDUAL', 'HOME_BUSINESS', 'RETAIL_STORE', 'SERVICE_PROVIDER', 'PROPERTY_OWNER', 'BROKER', 'EMPLOYER', 'EVENT_ORGANISER');

-- CreateEnum
CREATE TYPE "BusinessClaimStatus" AS ENUM ('OWNER_CREATED', 'UNCLAIMED', 'CLAIM_PENDING', 'CLAIMED');

-- DropForeignKey
ALTER TABLE "businesses" DROP CONSTRAINT "businesses_ownerId_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sellerType" "SellerType" NOT NULL DEFAULT 'INDIVIDUAL';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "attributionText" VARCHAR(400),
ADD COLUMN     "businessType" "BusinessType" NOT NULL DEFAULT 'RETAIL_STORE',
ADD COLUMN     "claimStatus" "BusinessClaimStatus" NOT NULL DEFAULT 'OWNER_CREATED',
ADD COLUMN     "confidenceScore" DECIMAL(3,2),
ADD COLUMN     "licenceName" VARCHAR(80),
ADD COLUMN     "pincodeCode" VARCHAR(6),
ADD COLUMN     "sourceName" VARCHAR(120),
ADD COLUMN     "sourceRecordId" VARCHAR(200),
ALTER COLUMN "ownerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "businesses_businessType_idx" ON "businesses"("businessType");

-- CreateIndex
CREATE INDEX "businesses_pincodeCode_claimStatus_idx" ON "businesses"("pincodeCode", "claimStatus");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_sourceName_sourceRecordId_key" ON "businesses"("sourceName", "sourceRecordId");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
