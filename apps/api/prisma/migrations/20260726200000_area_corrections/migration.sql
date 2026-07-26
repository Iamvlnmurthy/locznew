-- What people told us when the detected area was wrong.
--
-- A pincode centroid is the average of its post offices, so near the edge of a code the
-- nearest centroid is frequently not the area a person would name. They know; the
-- arithmetic does not. Recording the correction turns that into something the next
-- resolution can use.
CREATE TABLE IF NOT EXISTS "area_corrections" (
  "id"           UUID PRIMARY KEY,
  "latitude"     DECIMAL(10,7) NOT NULL,
  "longitude"    DECIMAL(10,7) NOT NULL,
  "geo"          geography(Point, 4326),
  "detectedCode" VARCHAR(6)    NOT NULL,
  "chosenCode"   VARCHAR(6)    NOT NULL,
  "userId"       UUID,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "area_corrections_detected_idx" ON "area_corrections" ("detectedCode");
CREATE INDEX IF NOT EXISTS "area_corrections_chosen_idx" ON "area_corrections" ("chosenCode");

-- The whole point is asking "what did people near this spot say?", which is a radius query.
CREATE INDEX IF NOT EXISTS "area_corrections_geo_gist_idx" ON "area_corrections" USING GIST ("geo");

-- Same trigger the other spatial tables use, so the point is derived rather than trusted
-- from the client.
DROP TRIGGER IF EXISTS "area_corrections_geo_sync" ON "area_corrections";
CREATE TRIGGER "area_corrections_geo_sync"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "area_corrections"
  FOR EACH ROW EXECUTE FUNCTION locz_sync_geo();
