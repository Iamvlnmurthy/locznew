-- CreateEnum
CREATE TYPE "ClaimReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BUSINESS_CLAIM_UPDATE';

-- CreateTable
CREATE TABLE "business_claims" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "claimantId" UUID NOT NULL,
    "status" "ClaimReviewStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" TEXT NOT NULL,
    "contactPhone" VARCHAR(20),
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" VARCHAR(400),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_claims_status_createdAt_idx" ON "business_claims"("status", "createdAt");

-- CreateIndex
CREATE INDEX "business_claims_businessId_idx" ON "business_claims"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "business_claims_businessId_claimantId_status_key" ON "business_claims"("businessId", "claimantId", "status");

-- AddForeignKey
ALTER TABLE "business_claims" ADD CONSTRAINT "business_claims_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_claims" ADD CONSTRAINT "business_claims_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_claims" ADD CONSTRAINT "business_claims_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
