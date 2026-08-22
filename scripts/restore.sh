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

# Restoring needs privileges the application role deliberately does not have: it is
# NOSUPERUSER NOCREATEDB, so it cannot create a database or install extensions. Falls
# back to the app role, which is enough to restore into an existing database.
ADMIN_USER="${POSTGRES_SUPERUSER:-${POSTGRES_USER}}"
ADMIN_PASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-${POSTGRES_PASSWORD}}"

export PGPASSWORD="${ADMIN_PASSWORD}"

psql_do() {
  psql --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" --username="${ADMIN_USER}" "$@"
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
  if ! psql_do --dbname=postgres -tc \
      "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'" | grep -q 1; then
    if ! psql_do --dbname=postgres -c \
        "CREATE DATABASE \"${TARGET_DB}\" OWNER ${POSTGRES_USER}"; then
      echo >&2
      echo "Could not create '${TARGET_DB}' as '${ADMIN_USER}'." >&2
      echo "The application role is NOSUPERUSER NOCREATEDB by design — set" >&2
      echo "POSTGRES_SUPERUSER and POSTGRES_SUPERUSER_PASSWORD, or create the" >&2
      echo "database yourself and re-run." >&2
      exit 1
    fi
  fi
fi

# PostGIS must exist before the dump's geography columns can be created.
psql_do --dbname="${TARGET_DB}" -c "CREATE EXTENSION IF NOT EXISTS postgis;" > /dev/null
psql_do --dbname="${TARGET_DB}" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" > /dev/null
psql_do --dbname="${TARGET_DB}" -c "CREATE EXTENSION IF NOT EXISTS citext;" > /dev/null

echo "Restoring ${DUMP_FILE} into ${TARGET_DB}…"

# --clean --if-exists makes the restore repeatable. We capture pg_restore's exit code rather
# than letting `|| echo` swallow it: the row-count and spatial checks below stay useful for
# diagnosis, but a non-zero restore must make the whole script fail (see the final exit), so a
# broken restore can never be mistaken for a good one.
RESTORE_STATUS=0
pg_restore \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${ADMIN_USER}" \
  --dbname="${TARGET_DB}" \
  --clean --if-exists \
  --no-owner --no-privileges \
  --jobs=4 \
  "${DUMP_FILE}" || RESTORE_STATUS=$?
if [ "${RESTORE_STATUS}" -ne 0 ]; then
  echo "pg_restore exited ${RESTORE_STATUS} — review the errors above before trusting this restore" >&2
fi

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
echo "If listings_with_geo is 0 but listings exist, the geography column did not survive —"
echo "check that PostGIS was installed before pg_restore ran."

# The script's exit status must reflect the restore, not just that it ran to the end. A
# non-zero pg_restore means the database is not trustworthy, so fail loudly here.
if [ "${RESTORE_STATUS}" -ne 0 ]; then
  echo
  echo "Restore FAILED: pg_restore exited ${RESTORE_STATUS}. Do not trust this database." >&2
  exit 1
fi
echo
echo "Restore complete."
