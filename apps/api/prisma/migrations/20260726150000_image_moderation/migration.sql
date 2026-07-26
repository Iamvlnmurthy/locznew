-- Make images reachable by moderation.
--
-- Until now nothing looked at an uploaded picture: the pipeline checked the file was
-- really an image, stripped its EXIF and made renditions. A photograph of ivory under the
-- title "old bangle" published without anything noticing.
--
-- Two hashes per image. SHA-256 catches the identical file being uploaded again — by the
-- same account or a different one. The perceptual hash catches the same picture
-- re-cropped, re-compressed or lightly watermarked, which is what someone does after their
-- first attempt is removed.
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'QUARANTINED';
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'SCANNING';
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "listing_media" ADD COLUMN IF NOT EXISTS "sha256" VARCHAR(64);
ALTER TABLE "listing_media" ADD COLUMN IF NOT EXISTS "perceptualHash" VARCHAR(32);

CREATE INDEX IF NOT EXISTS "listing_media_sha256_idx" ON "listing_media" ("sha256");
CREATE INDEX IF NOT EXISTS "listing_media_perceptualHash_idx" ON "listing_media" ("perceptualHash");

-- Refusing a listing does not stop the same photograph returning a minute later. Blocking
-- the image itself is what breaks that loop.
CREATE TABLE IF NOT EXISTS "blocked_image_hashes" (
  "id"          UUID PRIMARY KEY,
  "kind"        VARCHAR(20)  NOT NULL,
  "hash"        VARCHAR(64)  NOT NULL,
  "reason"      VARCHAR(300) NOT NULL,
  "category"    VARCHAR(60),
  "blockedById" UUID         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "blocked_image_hashes_kind_hash_key"
  ON "blocked_image_hashes" ("kind", "hash");
CREATE INDEX IF NOT EXISTS "blocked_image_hashes_kind_idx" ON "blocked_image_hashes" ("kind");
