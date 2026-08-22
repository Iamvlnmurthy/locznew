-- Locality names in Telugu and Hindi. Nullable and with no default, so this is a catalogue
-- change rather than a rewrite of 155,543 rows.
ALTER TABLE "localities" ADD COLUMN IF NOT EXISTS "nameTe" VARCHAR(160);
ALTER TABLE "localities" ADD COLUMN IF NOT EXISTS "nameHi" VARCHAR(160);
