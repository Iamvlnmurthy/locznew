-- Parallel table for the LocZ news ENGINE (regenerated + translated stories).
-- Kept separate from the live NewsEvent/NewsArticle tables so the current feed is undisturbed
-- until the API is switched over. Additive and idempotent.
CREATE TABLE IF NOT EXISTS news_stories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash    text UNIQUE NOT NULL,            -- dedup on source url + title
  category        text NOT NULL DEFAULT 'local',   -- political/national/state/local/business/tech/sports/entertainment/weather/crime/civic
  -- English (regenerated in LocZ tone — our own content, no source shown)
  title_en        text NOT NULL,
  dek_en          text,
  body_en         text NOT NULL,
  -- Translations (IndicTrans2)
  title_hi        text, body_hi text,
  title_te        text, body_te text,
  state_lang      text,                            -- e.g. 'te','ta','kn','mr','bn' (the state's language)
  title_sl        text, body_sl text,              -- state-language variant
  -- Media (shown WITH credit under the image)
  image_url       text,
  image_credit    text,
  -- Place / rings
  city            text, state text,
  latitude        double precision, longitude double precision,
  distribution_km integer DEFAULT 25,
  -- Provenance (kept internally for the future reviewer; NOT displayed for regenerated content)
  src_url         text, src_publisher text, src_lang text,
  published_at    timestamptz,
  status          text NOT NULL DEFAULT 'PUBLISHED', -- PUBLISHED | HELD (future reviewer queue)
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_stories_cat_pub  ON news_stories (category, published_at DESC);
CREATE INDEX IF NOT EXISTS news_stories_state    ON news_stories (state, published_at DESC);
CREATE INDEX IF NOT EXISTS news_stories_pub       ON news_stories (published_at DESC);
