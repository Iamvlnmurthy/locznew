#!/usr/bin/env bash
#
# Restores a LocZ backup.
#
#   ./scripts/restore.sh backups/locz-20260726-020000.dump
#   ./scripts/restore.sh backups/locz-...dump --into locz_restore_test
#
# The second form is the one to run monthly: restore into a throwaway database and check
# the row counts. A backup nobody has ever restored is a guess, not a backup.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="${1:-}"
TARGET_DB=""

if [[ -z "${DUMP_FILE}" ]]; then
  echo "Usage: $0 <dump-file> [--into <database>]" >&2
  exit 1
fi

if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "No such file: ${DUMP_FILE}" >&2
  exit 1
fi

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --into) TARGET_DB="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# shellcheck disable=SC1091
if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a && source "${ROOT_DIR}/.env" && set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set}"

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
TARGET_DB="${TARGET_DB:-${POSTGRES_DB}}"

export PGPASSWORD="${POSTGRES_PASSWORD}"

psql_do() {
  psql --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" --username="${POSTGRES_USER}" "$@"
}

# Overwriting the live database is the one genuinely destructive thing this script can
# do, so it is confirmed explicitly rather than guarded by a flag someone will copy.
if [[ "${TARGET_DB}" == "${POSTGRES_DB:-}" ]]; then
  echo "WARNING: this will overwrite the LIVE database '${TARGET_DB}' on ${POSTGRES_HOST}."
  read -r -p "Type the database name to confirm: " CONFIRM
  if [[ "${CONFIRM}" != "${TARGET_DB}" ]]; then
    echo "Aborted."
    exit 1
  fi
else
  echo "Restoring into '${TARGET_DB}' (creating it if absent)"
  psql_do --dbname=postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'" | grep -q 1 || \
    psql_do --dbname=postgres -c "CREATE DATABASE \"${TARGET_DB}\""
fi

# PostGIS must exist before the dump's geography columns can be created.
psql_do --dbname="${TARGET_DB}" -c "CREATE EXTENSION IF NOT EXISTS postgis;" > /dev/null
psql_do --dbname="${TARGET_DB}" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" > /dev/null
psql_do --dbname="${TARGET_DB}" -c "CREATE EXTENSION IF NOT EXISTS citext;" > /dev/null

echo "Restoring ${DUMP_FILE} into ${TARGET_DB}…"

# --clean --if-exists makes the restore repeatable. Errors are not suppressed: extension
# ownership produces noise, but a genuine failure must be visible.
pg_restore \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${TARGET_DB}" \
  --clean --if-exists \
  --no-owner --no-privileges \
  --jobs=4 \
  "${DUMP_FILE}" || echo "pg_restore reported errors — review them above before trusting this restore" >&2

echo
echo "Row counts after restore:"
psql_do --dbname="${TARGET_DB}" -c "
  SELECT 'users' AS table, COUNT(*) FROM users
  UNION ALL SELECT 'listings', COUNT(*) FROM listings
  UNION ALL SELECT 'listing_media', COUNT(*) FROM listing_media
  UNION ALL SELECT 'businesses', COUNT(*) FROM businesses
  UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
  ORDER BY 1;
"

# The spatial index and the derived column are what a naive restore is most likely to
# lose, and their absence is invisible until a nearby search quietly returns nothing.
echo "Spatial integrity:"
psql_do --dbname="${TARGET_DB}" -c "
  SELECT
    (SELECT COUNT(*) FROM listings WHERE geo IS NOT NULL) AS listings_with_geo,
    (SELECT COUNT(*) FROM pg_indexes
      WHERE tablename = 'listings' AND indexdef ILIKE '%gist%') AS gist_indexes;
"

echo
echo "Restore complete. If listings_with_geo is 0 but listings exist, the geography"
echo "column did not survive — check that PostGIS was installed before pg_restore ran."
