-- Indexes and constraints Prisma's schema language cannot express.
-- Runs immediately after the baseline migration.

-- ---------------------------------------------------------------------
-- Spatial indexes. GiST is the only access method PostGIS can use for
-- ST_DWithin and KNN (<->) — without these every nearby search is a seq scan.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "listings_geo_gist_idx"   ON "listings"   USING GIST ("geo");
CREATE INDEX IF NOT EXISTS "cities_geo_gist_idx"     ON "cities"     USING GIST ("geo");
CREATE INDEX IF NOT EXISTS "localities_geo_gist_idx" ON "localities" USING GIST ("geo");
CREATE INDEX IF NOT EXISTS "businesses_geo_gist_idx" ON "businesses" USING GIST ("geo");
CREATE INDEX IF NOT EXISTS "addresses_geo_gist_idx"  ON "addresses"  USING GIST ("geo");
CREATE INDEX IF NOT EXISTS "saved_locations_geo_gist_idx" ON "saved_locations" USING GIST ("geo");

-- Nearby search always filters to published listings first. A partial GiST index
-- keeps the spatial tree proportional to live inventory rather than to all history.
CREATE INDEX IF NOT EXISTS "listings_geo_published_gist_idx"
  ON "listings" USING GIST ("geo")
  WHERE "status" = 'PUBLISHED' AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------
-- Partial indexes for the background sweepers. These run every few minutes;
-- each must touch only the rows that can actually be due.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "listings_expiry_sweep_idx"
  ON "listings" ("expiresAt")
  WHERE "status" = 'PUBLISHED' AND "expiresAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "listings_moderation_queue_idx"
  ON "listings" ("createdAt")
  WHERE "moderationStatus" = 'PENDING';

CREATE INDEX IF NOT EXISTS "listing_media_orphan_sweep_idx"
  ON "listing_media" ("createdAt")
  WHERE "status" = 'PENDING_UPLOAD';

CREATE INDEX IF NOT EXISTS "notifications_unread_idx"
  ON "notifications" ("userId", "createdAt" DESC)
  WHERE "readAt" IS NULL;

CREATE INDEX IF NOT EXISTS "reports_open_idx"
  ON "reports" ("createdAt")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');

CREATE INDEX IF NOT EXISTS "sessions_active_idx"
  ON "sessions" ("expiresAt")
  WHERE "revokedAt" IS NULL;

-- Offers that are valid right now — the local-offers feed section.
--
-- Deliberately NOT a partial index on `"endsAt" > NOW()`: an index predicate must be
-- IMMUTABLE, and NOW() is STABLE, so PostgreSQL rejects it (42P17). A plain B-tree on
-- the range answers the same query; the planner uses it for both bounds.
CREATE INDEX IF NOT EXISTS "offer_details_active_idx"
  ON "offer_details" ("endsAt", "startsAt");

-- ---------------------------------------------------------------------
-- Business rule: a user may have many saved locations but exactly one default.
-- Enforced in the database because the API is not the only possible writer
-- (seeds, admin scripts, migrations).
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "saved_locations_one_default_per_user_idx"
  ON "saved_locations" ("userId")
  WHERE "isDefault" = true;

-- ---------------------------------------------------------------------
-- Trigram indexes for admin substring search ("...hyder..." must match).
-- B-tree cannot serve a leading-wildcard LIKE; pg_trgm can.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "cities_name_trgm_idx"     ON "cities"     USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "localities_name_trgm_idx" ON "localities" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "listings_title_trgm_idx"  ON "listings"   USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "businesses_name_trgm_idx" ON "businesses" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_phone_trgm_idx"     ON "users"      USING GIN ("phoneE164" gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Keep `geo` derived from latitude/longitude. The application writes the
-- decimal columns through Prisma; this trigger guarantees the geography
-- column can never silently disagree with them.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION locz_sync_geo() RETURNS trigger AS $$
BEGIN
  IF NEW."latitude" IS NOT NULL AND NEW."longitude" IS NOT NULL THEN
    NEW."geo" := ST_SetSRID(ST_MakePoint(NEW."longitude"::double precision,
                                         NEW."latitude"::double precision), 4326)::geography;
  ELSE
    NEW."geo" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "listings_geo_sync"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "listings"
  FOR EACH ROW EXECUTE FUNCTION locz_sync_geo();

CREATE TRIGGER "cities_geo_sync"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "cities"
  FOR EACH ROW EXECUTE FUNCTION locz_sync_geo();

CREATE TRIGGER "localities_geo_sync"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "localities"
  FOR EACH ROW EXECUTE FUNCTION locz_sync_geo();

CREATE TRIGGER "businesses_geo_sync"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "businesses"
  FOR EACH ROW EXECUTE FUNCTION locz_sync_geo();

CREATE TRIGGER "addresses_geo_sync"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "addresses"
  FOR EACH ROW EXECUTE FUNCTION locz_sync_geo();

CREATE TRIGGER "saved_locations_geo_sync"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "saved_locations"
  FOR EACH ROW EXECUTE FUNCTION locz_sync_geo();
