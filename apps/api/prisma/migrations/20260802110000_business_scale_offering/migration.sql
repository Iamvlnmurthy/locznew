-- CreateEnum
CREATE TYPE "BusinessScale" AS ENUM ('INDIVIDUAL_SHOP', 'HOME_BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "OfferingType" AS ENUM ('PRODUCTS', 'SERVICES', 'BOTH');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "offering" "OfferingType",
ADD COLUMN     "scale" "BusinessScale";

-- AlterTable
ALTER TABLE "business_claims" ADD COLUMN     "offeringProposed" "OfferingType",
ADD COLUMN     "proposedCategoryId" UUID,
ADD COLUMN     "proposedScale" "BusinessScale";
