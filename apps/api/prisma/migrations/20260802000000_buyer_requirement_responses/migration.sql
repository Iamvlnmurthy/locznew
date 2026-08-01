-- Makes buyer demand a first-class thing rather than a listing type with five columns.
--
-- The product principle is "buyers post what they need, sellers post what they have, LocZ
-- connects them nearby". The second half worked; the first was a table nobody could answer.
-- A seller could see a requirement and open a normal chat, and that was all: no structured
-- reply, no count, no way for the buyer to close it, no way to tell a seller one existed.
--
-- Four things arrive together because none of them is useful alone:
--
--   RequirementResponseKind   real answers are conditional. "Can arrange", "made to order"
--                             and "available at a different price" are the common cases, and
--                             collapsing them into yes/no loses the condition the buyer
--                             actually decides on.
--   requirement_responses     structured, so a buyer scanning six replies sees "available,
--                             1,400" beside "can arrange, by Friday" without reading six
--                             conversations. The chat is where the deal happens; this is how
--                             it starts.
--   lifecycle columns         fulfilledAt, responseCount, searchRadiusKm, fulfilment. An
--                             unfulfilled requirement that expired is the most valuable
--                             signal this platform collects: demand nobody nearby could meet.
--   REQUIREMENT_ENQUIRY       a seller answering a buyer reverses the usual roles, and a
--                             conversation that cannot say so cannot be shown correctly.
--
-- The unique index on (listingId, responderId) is the anti-spam control, and it is deliberately
-- in the database rather than in a service: one answer per seller per requirement, enforced
-- where a second code path cannot bypass it. A seller who changes their mind edits their reply.
--
-- Additive throughout. Nothing is dropped, no existing column changes type, and every new
-- column is nullable or defaulted, so the running API and the published APK keep working
-- untouched until the code that uses these lands.
--
-- The enum additions are safe inside the migration transaction on PostgreSQL 12 and later,
-- and nothing here uses the new values in the same transaction.

-- CreateEnum
CREATE TYPE "RequirementResponseKind" AS ENUM ('AVAILABLE', 'AVAILABLE_AT_DIFFERENT_PRICE', 'SIMILAR_AVAILABLE', 'CAN_ARRANGE', 'MADE_TO_ORDER', 'AVAILABLE_LATER', 'NOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "FulfilmentPreference" AS ENUM ('PICKUP', 'DELIVERY', 'EITHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REQUIREMENT_MATCH';
ALTER TYPE "NotificationType" ADD VALUE 'REQUIREMENT_RESPONSE';

-- AlterEnum
ALTER TYPE "ConversationContext" ADD VALUE 'REQUIREMENT_ENQUIRY';

-- AlterTable
ALTER TABLE "buyer_requirement_details" ADD COLUMN     "fulfilledAt" TIMESTAMP(3),
ADD COLUMN     "fulfilment" "FulfilmentPreference" NOT NULL DEFAULT 'EITHER',
ADD COLUMN     "responseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "searchRadiusKm" INTEGER;

-- CreateTable
CREATE TABLE "requirement_responses" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "responderId" UUID NOT NULL,
    "businessId" UUID,
    "kind" "RequirementResponseKind" NOT NULL,
    "offeredPrice" DECIMAL(12,2),
    "availableFrom" TIMESTAMP(3),
    "message" VARCHAR(500),
    "offeredListingId" UUID,
    "conversationId" UUID,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_responses_listingId_createdAt_idx" ON "requirement_responses"("listingId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "requirement_responses_responderId_createdAt_idx" ON "requirement_responses"("responderId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_responses_listingId_responderId_key" ON "requirement_responses"("listingId", "responderId");

-- CreateIndex
CREATE INDEX "buyer_requirement_details_fulfilledAt_idx" ON "buyer_requirement_details"("fulfilledAt");

-- AddForeignKey
ALTER TABLE "requirement_responses" ADD CONSTRAINT "requirement_responses_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "buyer_requirement_details"("listingId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_responses" ADD CONSTRAINT "requirement_responses_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_responses" ADD CONSTRAINT "requirement_responses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_responses" ADD CONSTRAINT "requirement_responses_offeredListingId_fkey" FOREIGN KEY ("offeredListingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
