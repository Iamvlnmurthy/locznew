-- The two layers below a district.
--
-- India is not a country of cities. An address is a village inside a mandal inside a
-- district, and someone in Sirikonda does not think of themselves as being "in Nizamabad"
-- any more than a Londoner thinks of themselves as being in the South East. The GeoNames
-- postal dataset already carries both: 155,542 named places and 11,359 mandals, sitting
-- unused because nothing read past the district column.
--
-- The mandal is stored on the rows that need to display it rather than as its own table.
-- Nobody browses a mandal index — it appears in an address line and in search — and a
-- table would add a join to every locality query to hold a name we already have.
ALTER TABLE "localities" ADD COLUMN IF NOT EXISTS "mandal" VARCHAR(140);
ALTER TABLE "pincodes"   ADD COLUMN IF NOT EXISTS "mandal" VARCHAR(140);

-- "Which villages are in this mandal" and "find a village by name" are the two questions.
CREATE INDEX IF NOT EXISTS "localities_mandal_idx" ON "localities" ("mandal");
CREATE INDEX IF NOT EXISTS "pincodes_mandal_idx" ON "pincodes" ("mandal");

-- A hundred and fifty thousand villages need to be searchable by partial name, the way the
-- pincodes already are.
CREATE INDEX IF NOT EXISTS "localities_name_trgm_idx"
  ON "localities" USING GIN ("name" gin_trgm_ops);

-- Every locality carries coordinates, so "what is near me" can answer with a village name
-- rather than a district.
CREATE INDEX IF NOT EXISTS "localities_geo_gist_idx" ON "localities" USING GIST ("geo");
