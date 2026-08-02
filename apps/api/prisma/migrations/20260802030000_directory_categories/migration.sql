-- Categories that exist for the business directory and never appear when somebody posts.
--
-- The imported directory needs slugs like hospitals-and-clinics and tyre-and-battery-stores
-- so four million businesses can be classified and found. None of them belong in the posting
-- flow: a person listing a used phone should not be shown "hospitals and clinics", and a
-- category list that long is one nobody reads.
--
-- A flag rather than marking them inactive. Inactive would take them out of search too,
-- which is the one thing they exist for.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "isDirectoryOnly" BOOLEAN NOT NULL DEFAULT false;
