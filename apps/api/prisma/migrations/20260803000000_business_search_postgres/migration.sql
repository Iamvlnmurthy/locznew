-- Business search moves from Meilisearch to Postgres.
--
-- Two reasons, both measured rather than assumed.
--
-- The container will not hold it. `locz-meilisearch` is capped at 512 MB and shares that
-- ceiling with the listings index. 3.4 million businesses would exhaust it and take
-- *listings* search down as collateral — a directory import breaking classified search.
--
-- The sync step is the durable reason. On 3 August, 400 businesses sat correctly in
-- Postgres while business search returned almost nothing, silently, because the derived
-- index had not been rebuilt. `search.controller.ts` already carries a comment about this
-- exact class of failure: "a silent queue is how a rebuild once appeared to succeed while
-- leaving the index empty." A generated column has no rebuild to forget and cannot drift.
--
-- Listings stay on Meilisearch. They are few, user-typed, and typo tolerance genuinely
-- matters when somebody types "iphon 13". Businesses are reached by category and proximity.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- The document IS the row, so there is nothing to rebuild and nothing to drift.
--
-- Only same-row columns may appear here: a generated column must be immutable and cannot
-- read another table. That excludes the category's vocabulary, which the Meilisearch
-- document carried as `categoryTerms`. It is a real loss — a shop named "Sri Lakshmi
-- Stores" filed under grocery no longer matches the word "kirana" — and it is also the
-- fix for a bug found on 3 August, where that same vocabulary made "kirana" return
-- astrologers. Category is a filter now, which is what `categoryId` was always for.
ALTER TABLE "businesses"
  ADD COLUMN "searchDoc" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string("keywords", ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce("sourceRecordId", '')), 'D')
  ) STORED;

-- `simple` rather than `english`: these are proper nouns and Indic transliterations, where
-- English stemming does more harm than good. "Medicals" must not stem to "medic".
CREATE INDEX "businesses_search_doc_idx" ON "businesses" USING gin ("searchDoc");

-- Typo tolerance, used only as a fallback when the strict query finds nothing.
CREATE INDEX "businesses_name_trgm_idx" ON "businesses" USING gin ("name" gin_trgm_ops);

-- Proximity. Already present in most environments; created here so a fresh database that
-- has never run the spatial migration still gets it.
CREATE INDEX IF NOT EXISTS "businesses_geo_idx" ON "businesses" USING gist ("geo");
