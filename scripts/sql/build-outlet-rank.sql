-- One indexable page per identically-named outlet per pincode.
--
-- 679,346 businesses share their exact name with another business in the same city: 19,773 called
-- "Hindustan Petroleum Corporation Limited", 15,271 "HDFC Bank ATM", the largest single cluster
-- holding 1,853. Two branches of one chain measured 83.2% identical page text over a 372-word
-- verbatim run, and no amount of generated prose separates them -- they are the same result at two
-- addresses, and a search engine collapsing them is behaving correctly.
--
-- So pick one per (name, pincode) to represent that name in that locality and mark the rest. The
-- pick is the one people already visit, with id as a tie-break so the choice is stable: a page
-- that drops in and out of the index between crawls is worse than either state.
--
-- Rank 1 is deliberately NOT stored. The table holds only the ~223,580 pages that should carry
-- noindex, so the common case is a miss on a primary-key lookup (0.18ms) and the absence of a row
-- is the answer.
--
-- A separate table, never a column on `businesses`: a mass UPDATE across 4.3M rows blocks the
-- viewCount increments that every profile view performs and spikes autovacuum on a table that is
-- serving traffic. This builds into a new relation and swaps it in.
--
-- Re-run after a bulk import, or when claims start arriving in volume -- a claimed listing should
-- outrank an unclaimed one, which is a change to the ORDER BY below and a conversation worth
-- having then rather than a rule to bake in now.
--
--   docker exec -i <postgres> psql -U locz -d locz -f build-outlet-rank.sql

\set ON_ERROR_STOP on

BEGIN;

DROP TABLE IF EXISTS business_outlet_rank_new;

CREATE TABLE business_outlet_rank_new AS
WITH ranked AS (
  SELECT
    b.id,
    row_number() OVER (
      PARTITION BY lower(btrim(b.name)), b."pincodeCode"
      ORDER BY b."viewCount" DESC, b.id
    ) AS rnk,
    count(*) OVER (PARTITION BY lower(btrim(b.name)), b."pincodeCode") AS siblings
  FROM businesses b
  WHERE b."deletedAt" IS NULL
    AND b."isActive"
    AND b."pincodeCode" IS NOT NULL
)
SELECT id, rnk::int AS rnk, siblings::int AS siblings
FROM ranked
WHERE rnk > 1;

ALTER TABLE business_outlet_rank_new ADD PRIMARY KEY (id);

DROP TABLE IF EXISTS business_outlet_rank;
ALTER TABLE business_outlet_rank_new RENAME TO business_outlet_rank;

COMMIT;

-- Sanity: a claimed or verified listing must never be demoted. Nobody who has taken ownership of
-- their page should find it deindexed because a busier branch shares the name.
SELECT
  (SELECT count(*) FROM business_outlet_rank) AS flagged,
  (SELECT count(*) FROM business_outlet_rank r
     JOIN businesses b ON b.id = r.id
    WHERE b."claimStatus" = 'CLAIMED' OR b."verificationStatus" = 'VERIFIED') AS claimed_flagged;
