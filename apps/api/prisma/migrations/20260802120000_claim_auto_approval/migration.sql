-- AlterTable
ALTER TABLE "business_claims" ADD COLUMN     "autoApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "locationAccuracyM" INTEGER,
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "matchedSignals" TEXT[];
