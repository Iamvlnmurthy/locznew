-- The quarantine states the schema already declares.
--
-- `schema.prisma` gained QUARANTINED, SCANNING, REVIEW_REQUIRED and REJECTED, and the code
-- that reads them shipped, but the enum in the database was never altered. The generated
-- client happily sends a value PostgreSQL does not have, so every listing approval failed
-- with "invalid input value for enum MediaStatus" — a 500 that reads as a database fault
-- rather than as a missing migration.
--
-- ADD VALUE IF NOT EXISTS is safe to re-run and safe on a database that already has them,
-- which matters because this repairs an environment that may be in either state.
--
-- Values are appended rather than inserted in schema order. Their order in the type is
-- cosmetic; nothing compares MediaStatus by ordinality.
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'QUARANTINED';
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'SCANNING';
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
