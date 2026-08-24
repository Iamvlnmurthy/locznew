-- City content for rich /in/<city> pages: a 1:1 editorial profile, sourced guide sections, and
-- image references (bytes live in object storage). All keyed to cities with ON DELETE CASCADE.
-- New tables only — nothing on the existing cities row changes.

CREATE TABLE IF NOT EXISTS "city_content" (
  "cityId"          UUID PRIMARY KEY,
  "shortIntro"      TEXT,
  "description"     TEXT,
  "famousFor"       VARCHAR(500),
  "character"       TEXT,
  "economySummary"  TEXT,
  "climate"         VARCHAR(120),
  "knownFor"        VARCHAR(500),
  "seoTitle"        VARCHAR(200),
  "metaDescription" VARCHAR(400),
  "sourceName"      VARCHAR(160),
  "dataQuality"     VARCHAR(20),
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "city_content_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "city_sections" (
  "id"         UUID PRIMARY KEY,
  "cityId"     UUID NOT NULL,
  "sectionKey" VARCHAR(40) NOT NULL,
  "title"      VARCHAR(120) NOT NULL,
  "content"    TEXT NOT NULL,
  "sourceUrl"  VARCHAR(500),
  "license"    VARCHAR(60),
  "source"     VARCHAR(60),
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "city_sections_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "city_sections_cityId_sectionKey_key" ON "city_sections"("cityId", "sectionKey");
CREATE INDEX IF NOT EXISTS "city_sections_cityId_idx" ON "city_sections"("cityId");

CREATE TABLE IF NOT EXISTS "city_images" (
  "id"          UUID PRIMARY KEY,
  "cityId"      UUID NOT NULL,
  "kind"        VARCHAR(20) NOT NULL,
  "title"       VARCHAR(160),
  "storageUrl"  VARCHAR(500) NOT NULL,
  "source"      VARCHAR(120),
  "license"     VARCHAR(60),
  "attribution" VARCHAR(300),
  "width"       INTEGER,
  "height"      INTEGER,
  "contentHash" VARCHAR(64),
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "city_images_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "city_images_cityId_kind_idx" ON "city_images"("cityId", "kind");
