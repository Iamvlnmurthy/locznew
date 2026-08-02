-- Records what people search for, so the vocabulary stops being a guess.
--
-- A category term list can say what a category is. It cannot say what is inside one, and no
-- amount of hand-writing reaches "toor dal", "weighing machine" or "bed bug spray". A search
-- that returns nothing is somebody naming a word we do not have, and after a week in one
-- city that is a real list ranked by how often it is typed.
--
-- Deliberately not personal. No user id, no device id, no IP -- knowing that a word was
-- searched improves the platform, knowing who searched it only builds a history of what
-- individuals were looking for. The city is kept because demand is local, which is the whole
-- point of learning it.
--
-- Prohibited searches are never written at all. That is enforced in the service against the
-- same banned-keyword list moderation uses, because storing them would put banned words in
-- front of whoever reads the report, where they could reasonably be added to the search
-- terms -- tuning the product for exactly the content it refuses to host.

-- CreateTable
CREATE TABLE "search_query_logs" (
    "id" UUID NOT NULL,
    "normalisedQuery" VARCHAR(120) NOT NULL,
    "cityId" UUID,
    "pincode" VARCHAR(6),
    "categoryId" UUID,
    "resultCount" INTEGER NOT NULL,
    "isZeroResult" BOOLEAN NOT NULL,
    "hadFilters" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_query_logs_isZeroResult_cityId_createdAt_idx" ON "search_query_logs"("isZeroResult", "cityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "search_query_logs_normalisedQuery_idx" ON "search_query_logs"("normalisedQuery");

-- AddForeignKey
ALTER TABLE "search_query_logs" ADD CONSTRAINT "search_query_logs_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_query_logs" ADD CONSTRAINT "search_query_logs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
