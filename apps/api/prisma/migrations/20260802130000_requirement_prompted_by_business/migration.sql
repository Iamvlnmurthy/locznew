-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "promptedByBusinessId" UUID;

-- CreateIndex
CREATE INDEX "listings_promptedByBusinessId_idx" ON "listings"("promptedByBusinessId");
