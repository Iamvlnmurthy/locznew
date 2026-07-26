-- A protected-hash match is evidence, not an ordinary moderation rejection.
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'LEGAL_HOLD';

CREATE TYPE "MediaSafetyCaseStatus" AS ENUM ('OPEN', 'REPORTED', 'RELEASED', 'CLOSED');
CREATE TYPE "MediaSafetyAccessAction" AS ENUM ('EVIDENCE_PREVIEW');

CREATE TABLE "media_safety_cases" (
  "id"                UUID PRIMARY KEY,
  "mediaId"           UUID NOT NULL UNIQUE,
  "status"            "MediaSafetyCaseStatus" NOT NULL DEFAULT 'OPEN',
  "provider"          VARCHAR(60) NOT NULL,
  "providerReference" VARCHAR(200),
  "reasonCode"        VARCHAR(80) NOT NULL,
  "openedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reportedAt"        TIMESTAMP(3),
  "releasedAt"        TIMESTAMP(3),
  "closedAt"          TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_safety_cases_mediaId_fkey"
    FOREIGN KEY ("mediaId") REFERENCES "listing_media"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "media_safety_cases_status_openedAt_idx"
  ON "media_safety_cases" ("status", "openedAt");

CREATE TABLE "media_safety_access_logs" (
  "id"            UUID PRIMARY KEY,
  "caseId"        UUID NOT NULL,
  "actorId"       UUID NOT NULL,
  "action"        "MediaSafetyAccessAction" NOT NULL,
  "justification" VARCHAR(500) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_safety_access_logs_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "media_safety_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "media_safety_access_logs_caseId_createdAt_idx"
  ON "media_safety_access_logs" ("caseId", "createdAt" DESC);
CREATE INDEX "media_safety_access_logs_actorId_createdAt_idx"
  ON "media_safety_access_logs" ("actorId", "createdAt" DESC);
