-- Safety-case transitions are privileged, auditable actions rather than ordinary
-- moderation updates. References and notes contain metadata only, never image content.
ALTER TYPE "MediaSafetyAccessAction" ADD VALUE IF NOT EXISTS 'CASE_REPORTED';
ALTER TYPE "MediaSafetyAccessAction" ADD VALUE IF NOT EXISTS 'HOLD_RELEASED';
ALTER TYPE "MediaSafetyAccessAction" ADD VALUE IF NOT EXISTS 'CASE_CLOSED';

ALTER TABLE "media_safety_cases"
  ADD COLUMN "reportReference" VARCHAR(200),
  ADD COLUMN "resolutionNote" VARCHAR(500);
