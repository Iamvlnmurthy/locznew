#!/usr/bin/env bash
#
# Post-migration health check.
#
#   ./scripts/verify-db.sh
#
# Run this immediately after the first `npm run db:migrate`. It checks the things that
# fail silently — a missing PostGIS extension, an absent spatial index, a geography
# column that never got populated — rather than the things that throw loudly on their own.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck disable=SC1091
if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a && source "${ROOT_DIR}/.env" && set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is not set}"
: "${POSTGRES_DB:?POSTGRES_DB is not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set}"

export PGPASSWORD="${POSTGRES_PASSWORD}"
PSQL=(psql --host="${POSTGRES_HOST:-localhost}" --port="${POSTGRES_PORT:-5432}"
      --username="${POSTGRES_USER}" --dbname="${POSTGRES_DB}" -tA)

FAILURES=0

check() {
  local label="$1" query="$2" expectation="$3"
  local result
  result="$("${PSQL[@]}" -c "${query}" | tr -d '[:space:]')"

  if [[ "${result}" == "${expectation}" ]]; then
    printf '  ✓ %-46s %s\n' "${label}" "${result}"
  else
    printf '  ✗ %-46s got "%s", expected "%s"\n' "${label}" "${result}" "${expectation}"
    FAILURES=$((FAILURES + 1))
  fi
}

report() {
  local label="$1" query="$2"
  printf '  · %-46s %s\n' "${label}" "$("${PSQL[@]}" -c "${query}" | tr -d '[:space:]')"
}

echo "Verifying ${POSTGRES_DB} on ${POSTGRES_HOST:-localhost}"
echo
echo "Extensions"
check "postgis installed" \
  "SELECT COUNT(*) FROM pg_extension WHERE extname='postgis'" "1"
check "pg_trgm installed" \
  "SELECT COUNT(*) FROM pg_extension WHERE extname='pg_trgm'" "1"
check "citext installed" \
  "SELECT COUNT(*) FROM pg_extension WHERE extname='citext'" "1"
report "postgis version" "SELECT PostGIS_Lib_Version()"

echo
echo "Schema"
check "53 tables created (52 models + PostGIS)" \
  "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma%'" "53"
check "both migrations applied" \
  "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL" "2"

echo
echo "Spatial indexes — without these, every nearby search is a sequential scan"
check "listings GiST index" \
  "SELECT COUNT(*) FROM pg_indexes WHERE tablename='listings' AND indexname='listings_geo_gist_idx'" "1"
check "listings partial GiST (published only)" \
  "SELECT COUNT(*) FROM pg_indexes WHERE indexname='listings_geo_published_gist_idx'" "1"
check "cities GiST index" \
  "SELECT COUNT(*) FROM pg_indexes WHERE indexname='cities_geo_gist_idx'" "1"
check "businesses GiST index" \
  "SELECT COUNT(*) FROM pg_indexes WHERE indexname='businesses_geo_gist_idx'" "1"

echo
echo "Constraints and triggers"
check "one default saved location per user" \
  "SELECT COUNT(*) FROM pg_indexes WHERE indexname='saved_locations_one_default_per_user_idx'" "1"
check "geo sync trigger on listings" \
  "SELECT COUNT(*) FROM pg_trigger WHERE tgname='listings_geo_sync'" "1"
check "geo sync trigger on cities" \
  "SELECT COUNT(*) FROM pg_trigger WHERE tgname='cities_geo_sync'" "1"

echo
echo "Seed data"
check "9 roles" "SELECT COUNT(*) FROM roles" "9"
report "cities" "SELECT COUNT(*) FROM cities"
report "categories" "SELECT COUNT(*) FROM categories"
report "banned keywords" "SELECT COUNT(*) FROM banned_keywords"

echo
echo "Derived geography — the failure that looks like 'no results near me'"
check "every city with coordinates has geo" \
  "SELECT COUNT(*) FROM cities WHERE latitude IS NOT NULL AND geo IS NULL" "0"
report "listings missing geo" \
  "SELECT COUNT(*) FROM listings WHERE latitude IS NOT NULL AND geo IS NULL"

echo
echo "Coordinate sanity — ST_MakePoint takes longitude first, and a swap is silent"
# Hyderabad is 78.49E 17.39N. Measured from the city centre, Hyderabad should be ~0 km
# away. A result in the hundreds of kilometres means the arguments are reversed somewhere.
report "km from Hyderabad centre to nearest city" \
  "SELECT ROUND((ST_Distance(geo, ST_SetSRID(ST_MakePoint(78.4867, 17.385), 4326)::geography) / 1000)::numeric, 1)
   FROM cities WHERE geo IS NOT NULL
   ORDER BY geo <-> ST_SetSRID(ST_MakePoint(78.4867, 17.385), 4326)::geography LIMIT 1"

echo
if [[ "${FAILURES}" -eq 0 ]]; then
  echo "All checks passed."
else
  echo "${FAILURES} check(s) failed — see docs/TROUBLESHOOTING.md#database" >&2
  exit 1
fi
