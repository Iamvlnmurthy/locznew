-- News intelligence foundation (docs/NEWS_INTELLIGENCE_ARCHITECTURE.md, Phase 1).
-- Tables/enums/indexes/FKs below are Prisma-canonical (migrate diff); the PostGIS
-- geo trigger + GIST index and the alias trigram index are hand-added, matching the
-- cities/pincodes pattern, because Prisma cannot express geography(Point,4326).

-- CreateEnum
CREATE TYPE "NewsSourceType" AS ENUM ('RSS', 'ATOM', 'API', 'SITEMAP', 'NEWS_SITEMAP', 'HTML', 'GOV', 'ALERT');

-- CreateEnum
CREATE TYPE "NewsMediaPolicy" AS ENUM ('MEDIA_DISABLED', 'MEDIA_METADATA_ONLY', 'MEDIA_LINK_ONLY', 'MEDIA_EMBED_ALLOWED', 'MEDIA_HOTLINK_ALLOWED', 'MEDIA_DOWNLOAD_ALLOWED', 'MEDIA_DOWNLOAD_AND_REHOST_ALLOWED');

-- CreateEnum
CREATE TYPE "NewsEventStatus" AS ENUM ('VERIFIED', 'HIGH_CONFIDENCE', 'REPORTED', 'UNVERIFIED', 'DISPUTED', 'CORRECTED', 'RETRACTED');

-- CreateEnum
CREATE TYPE "NewsArticleRole" AS ENUM ('PRIMARY', 'SUPPORTING', 'SYNDICATED');

-- CreateEnum
CREATE TYPE "AliasEntityType" AS ENUM ('STATE', 'DISTRICT', 'CITY', 'LOCALITY');

-- CreateTable
CREATE TABLE "NewsSource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "sourceType" "NewsSourceType" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "dataSourceId" UUID,
    "coverageStateId" UUID,
    "coverageDistrictId" UUID,
    "coverageCityId" UUID,
    "coverageScope" TEXT NOT NULL DEFAULT 'regional',
    "crawlAllowed" BOOLEAN NOT NULL DEFAULT true,
    "crawlIntervalSec" INTEGER NOT NULL DEFAULT 900,
    "reliability" INTEGER NOT NULL DEFAULT 50,
    "nextFetchAt" TIMESTAMP(3),
    "lastFetchAt" TIMESTAMP(3),
    "lastChangeAt" TIMESTAMP(3),
    "etag" TEXT,
    "lastModified" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SourceHealth" NOT NULL DEFAULT 'DISABLED',
    "mediaPolicy" "NewsMediaPolicy" NOT NULL DEFAULT 'MEDIA_METADATA_ONLY',
    "attributionRequired" BOOLEAN NOT NULL DEFAULT true,
    "mediaLicense" TEXT,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "articlesFound" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSeen" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsFeed" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "feedType" "NewsSourceType" NOT NULL,
    "language" TEXT,
    "etag" TEXT,
    "lastModified" TEXT,
    "lastFetchAt" TIMESTAMP(3),
    "nextFetchAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawNewsDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feedId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "fetchError" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawNewsDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceId" UUID NOT NULL,
    "rawDocId" UUID,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "canonicalUrl" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publisher" TEXT,
    "author" TEXT,
    "imageUrl" TEXT,
    "category" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedAtSrc" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "categories" TEXT[],
    "severity" INTEGER NOT NULL DEFAULT 0,
    "status" "NewsEventStatus" NOT NULL DEFAULT 'REPORTED',
    "trustScore" INTEGER NOT NULL DEFAULT 0,
    "relevanceScore" INTEGER NOT NULL DEFAULT 0,
    "originatingAgency" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geo" geography(Point, 4326),
    "distributionRadiusM" INTEGER NOT NULL DEFAULT 5000,
    "coverageStateId" UUID,
    "coverageDistrictId" UUID,
    "coverageCityId" UUID,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latestUpdateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsEventArticle" (
    "eventId" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "role" "NewsArticleRole" NOT NULL DEFAULT 'SUPPORTING',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsEventArticle_pkey" PRIMARY KEY ("eventId","articleId")
);

-- CreateTable
CREATE TABLE "NewsEventLocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventId" UUID NOT NULL,
    "entityType" "AliasEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsEventLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsEventUpdate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsEventUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationAlias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aliasNormalized" TEXT NOT NULL,
    "aliasDisplay" TEXT NOT NULL,
    "entityType" "AliasEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "language" TEXT,
    "source" TEXT NOT NULL DEFAULT 'seed',
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_key_key" ON "NewsSource"("key");

-- CreateIndex
CREATE INDEX "NewsSource_sourceType_status_idx" ON "NewsSource"("sourceType", "status");

-- CreateIndex
CREATE INDEX "NewsSource_nextFetchAt_idx" ON "NewsSource"("nextFetchAt");

-- CreateIndex
CREATE INDEX "NewsSource_coverageCityId_idx" ON "NewsSource"("coverageCityId");

-- CreateIndex
CREATE INDEX "NewsFeed_active_nextFetchAt_idx" ON "NewsFeed"("active", "nextFetchAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsFeed_sourceId_url_key" ON "NewsFeed"("sourceId", "url");

-- CreateIndex
CREATE INDEX "RawNewsDocument_status_idx" ON "RawNewsDocument"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RawNewsDocument_feedId_externalId_key" ON "RawNewsDocument"("feedId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "RawNewsDocument_feedId_contentHash_key" ON "RawNewsDocument"("feedId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_rawDocId_key" ON "NewsArticle"("rawDocId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_canonicalUrl_key" ON "NewsArticle"("canonicalUrl");

-- CreateIndex
CREATE INDEX "NewsArticle_sourceId_publishedAt_idx" ON "NewsArticle"("sourceId", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsEvent_slug_key" ON "NewsEvent"("slug");

-- CreateIndex
CREATE INDEX "NewsEvent_latestUpdateAt_idx" ON "NewsEvent"("latestUpdateAt");

-- CreateIndex
CREATE INDEX "NewsEvent_status_latestUpdateAt_idx" ON "NewsEvent"("status", "latestUpdateAt");

-- CreateIndex
CREATE INDEX "NewsEventArticle_articleId_idx" ON "NewsEventArticle"("articleId");

-- CreateIndex
CREATE INDEX "NewsEventLocation_entityType_entityId_idx" ON "NewsEventLocation"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsEventLocation_eventId_entityType_entityId_key" ON "NewsEventLocation"("eventId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "NewsEventUpdate_eventId_createdAt_idx" ON "NewsEventUpdate"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "LocationAlias_entityType_entityId_idx" ON "LocationAlias"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationAlias_aliasNormalized_entityType_entityId_key" ON "LocationAlias"("aliasNormalized", "entityType", "entityId");

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "NewsFeed" ADD CONSTRAINT "NewsFeed_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawNewsDocument" ADD CONSTRAINT "RawNewsDocument_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "NewsFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_rawDocId_fkey" FOREIGN KEY ("rawDocId") REFERENCES "RawNewsDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsEventArticle" ADD CONSTRAINT "NewsEventArticle_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsEventArticle" ADD CONSTRAINT "NewsEventArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsEventLocation" ADD CONSTRAINT "NewsEventLocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsEventUpdate" ADD CONSTRAINT "NewsEventUpdate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Populate NewsEvent.geo from latitude/longitude, exactly as cities/pincodes/listings do.
CREATE TRIGGER "NewsEvent_geo_sync"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "NewsEvent"
  FOR EACH ROW EXECUTE FUNCTION locz_sync_geo();

-- Nearby-feed radius query (ST_DWithin on the event point) must not be a seq scan.
CREATE INDEX IF NOT EXISTS "NewsEvent_geo_gist_idx" ON "NewsEvent" USING GIST ("geo");

-- Alias resolution looks places up by normalized name, including fuzzy matches.
CREATE INDEX IF NOT EXISTS "LocationAlias_aliasNormalized_trgm_idx" ON "LocationAlias" USING GIN ("aliasNormalized" gin_trgm_ops);
