-- What a business sells, in the words a customer would type.
--
-- Category vocabulary stops at the category: it makes a kirana shop findable by "kirana"
-- and never by "toor dal". Defaulted to an empty array rather than left nullable so that
-- every read path gets a list, and four million imported rows need no backfill pass.
ALTER TABLE "businesses" ADD COLUMN "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
