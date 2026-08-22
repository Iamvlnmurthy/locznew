-- The search terms a business is found by, in each language LocZ serves.
CREATE TABLE IF NOT EXISTS "keyword_translations" (
  "term"      VARCHAR(120) NOT NULL,
  "nameTe"    VARCHAR(160),
  "nameHi"    VARCHAR(160),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "keyword_translations_pkey" PRIMARY KEY ("term")
);
