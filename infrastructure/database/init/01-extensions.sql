-- Runs once, on first initialisation of the postgres data volume.
-- Prisma migrations own the schema; this file only guarantees the extensions
-- those migrations depend on are present before the first migration runs.

CREATE EXTENSION IF NOT EXISTS postgis;          -- geography/geometry types, ST_DWithin, KNN
CREATE EXTENSION IF NOT EXISTS pg_trgm;          -- trigram indexes for admin substring search
CREATE EXTENSION IF NOT EXISTS unaccent;         -- accent-insensitive matching for city names
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- uuid generation fallback
CREATE EXTENSION IF NOT EXISTS citext;           -- case-insensitive email column
