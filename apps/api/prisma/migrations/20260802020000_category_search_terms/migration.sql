-- What people type when they want a category.
--
-- This is what makes an imported directory record findable. A scraped shop has a name, a
-- category and a location and nothing else -- no menu, no product list. Nobody searching
-- "biryani" will ever match "Paradise Restaurant" on its own text. The category knows a
-- restaurant is where biryani comes from, and these terms carry that onto every listing and
-- business in it.
--
-- Per category rather than per record, so a few hundred terms cover four million businesses.
-- Generating phrase combinations instead would be far larger, never complete, and stale the
-- day somebody opens a shawarma stall.
--
-- All three languages in one list: someone typing బిర్యానీ and someone typing biryani are
-- looking for the same shop.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "searchTerms" TEXT[];
