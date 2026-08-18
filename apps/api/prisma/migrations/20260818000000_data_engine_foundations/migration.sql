-- Data Engine foundations: source registry + raw ingestion layer.
-- Additive only — new types and tables, no change to existing entities.

-- CreateEnum
CREATE TYPE "MediaOrigin" AS ENUM ('EXTERNAL', 'LOCZ_UPLOAD', 'LOCZ_GENERATED', 'PERMITTED_CACHE');
CREATE TYPE "SourceTrustLevel" AS ENUM ('OFFICIAL', 'VERIFIED_LOCZ_BUSINESS', 'LOCZ_PARTNER', 'LICENSED_SOURCE', 'OPEN_DATA_SOURCE', 'COMMUNITY', 'UNVERIFIED');
CREATE TYPE "SourceHealth" AS ENUM ('HEALTHY', 'DEGRADED', 'FAILING', 'DISABLED');
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'SKIPPED');
CREATE TYPE "CityLaunchState" AS ENUM ('PLANNED', 'SEEDING', 'REVIEW', 'ACTIVE', 'LIMITED');

-- CreateTable
CREATE TABLE "DataSource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "docsUrl" TEXT,
    "baseUrl" TEXT,
    "authMethod" TEXT NOT NULL DEFAULT 'none',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "trustLevel" "SourceTrustLevel" NOT NULL DEFAULT 'OPEN_DATA_SOURCE',
    "refreshSeconds" INTEGER NOT NULL DEFAULT 86400,
    "rateLimitPerMin" INTEGER,
    "attributionText" TEXT,
    "termsReviewed" BOOLEAN NOT NULL DEFAULT false,
    "commercialUse" BOOLEAN NOT NULL DEFAULT false,
    "storagePermitted" BOOLEAN NOT NULL DEFAULT false,
    "cachingPermitted" BOOLEAN NOT NULL DEFAULT false,
    "mediaDisplay" BOOLEAN NOT NULL DEFAULT false,
    "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "health" "SourceHealth" NOT NULL DEFAULT 'DISABLED',
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "duplicatesRejected" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRawRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUpdatedAt" TIMESTAMP(3),
    "status" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "h3" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceRawRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_key_key" ON "DataSource"("key");
CREATE INDEX "DataSource_type_enabled_idx" ON "DataSource"("type", "enabled");
CREATE UNIQUE INDEX "SourceRawRecord_sourceId_externalId_key" ON "SourceRawRecord"("sourceId", "externalId");
CREATE INDEX "SourceRawRecord_status_idx" ON "SourceRawRecord"("status");
CREATE INDEX "SourceRawRecord_h3_idx" ON "SourceRawRecord"("h3");

-- AddForeignKey
ALTER TABLE "SourceRawRecord" ADD CONSTRAINT "SourceRawRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
