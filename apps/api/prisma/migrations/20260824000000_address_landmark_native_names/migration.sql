-- Transliterations of the address landmark into Telugu and Hindi, so the server-composed
-- description on /te and /hi business pages does not drop an English proper noun mid-sentence
-- ("... Cyberabad Women Police Station దగ్గర ఉంది"). Mirrors localities.nameTe/nameHi.
--
-- Nullable, no default => metadata-only in PostgreSQL, so this is instant on the 4M-row
-- addresses table and rewrites nothing. Backfilled per distinct landmark string separately.
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "landmarkTe" VARCHAR(160);
ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "landmarkHi" VARCHAR(160);
