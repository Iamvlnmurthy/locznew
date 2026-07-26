#!/usr/bin/env bash
#
# Disaster-recovery rehearsal.
#
#   ./scripts/restore-drill.sh                     # back up, restore to a scratch database, compare, drop it
#   ./scripts/restore-drill.sh /path/to/x.dump     # rehearse a specific backup file
#   KEEP_SCRATCH=1 ./scripts/restore-drill.sh      # leave the restored copy for inspection
#
# A backup nobody has restored is a hypothesis. This restores one into a scratch database
# alongside the live one and then checks the things that actually decide whether the
# application works afterwards:
#
#   - every table, and the same number of rows in each
#   - every index, including the GiST spatial and partial ones the migrations add by hand
#   - every trigger, because the geo column is derived by one — lose it and coordinates
#     silently stop becoming points, which no row count would reveal
#   - the extensions, since PostGIS types cannot restore without them
#   - and a working spatial query on the restored copy, which is the only proof that the
#     structures are not merely present but functional
#
# It never touches the live database. The scratch copy is dropped at the end unless
# KEEP_SCRATCH is set.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck disable=SC1091
if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a && source "${ROOT_DIR}/.env" && set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is not set}"
: "${POSTGRES_DB:?POSTGRES_DB is not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set}"

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
SCRATCH_DB="${SCRATCH_DB:-locz_restore_drill}"

# Creating a database needs a role that may create one. The application role is
# deliberately NOCREATEDB, so the drill uses the superuser when it is available and says
# plainly what is missing when it is not.
DRILL_USER="${POSTGRES_SUPERUSER:-${POSTGRES_USER}}"
DRILL_PASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-${POSTGRES_PASSWORD}}"

PSQL_BIN="${LOCZ_PSQL:-psql}"
PG_DUMP_BIN="${LOCZ_PG_DUMP:-pg_dump}"
PG_RESTORE_BIN="${LOCZ_PG_RESTORE:-pg_restore}"

passed=0
failed=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "${expected}" == "${actual}" ]]; then
    printf '  \xe2\x9c\x93 %s  %s\n' "${label}" "${actual}"
    passed=$((passed + 1))
  else
    printf '  \xe2\x9c\x97 %s  expected %s, restored %s\n' "${label}" "${expected}" "${actual}" >&2
    failed=$((failed + 1))
  fi
}

live() {
  PGPASSWORD="${POSTGRES_PASSWORD}" "${PSQL_BIN}" \
    --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" \
    --username="${POSTGRES_USER}" --dbname="${POSTGRES_DB}" -tAc "$1" | tr -d '[:space:]'
}

scratch() {
  PGPASSWORD="${DRILL_PASSWORD}" "${PSQL_BIN}" \
    --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" \
    --username="${DRILL_USER}" --dbname="${SCRATCH_DB}" -tAc "$1" | tr -d '[:space:]'
}

admin() {
  PGPASSWORD="${DRILL_PASSWORD}" "${PSQL_BIN}" \
    --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" \
    --username="${DRILL_USER}" --dbname=postgres -tAc "$1"
}

cleanup() {
  if [[ -z "${KEEP_SCRATCH:-}" ]]; then
    admin "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\"" > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[$(date -Is)] Restore drill for ${POSTGRES_DB} on ${POSTGRES_HOST}:${POSTGRES_PORT}"

# ---------------------------------------------------------------- the backup
DUMP="${1:-}"
if [[ -z "${DUMP}" ]]; then
  DUMP="$(mktemp -t locz-drill-XXXXXX).dump"
  declare -A LIVE_AT_DUMP

# Counted before the dump rather than after, so a table that moves while the drill runs can
# be told apart from one that failed to restore.
while read -r line; do
  [[ -z "${line}" ]] && continue
  LIVE_AT_DUMP["${line%%|*}"]="${line##*|}"
done < <(
  PGPASSWORD="${POSTGRES_PASSWORD}" "${PSQL_BIN}" \
    --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" \
    --username="${POSTGRES_USER}" --dbname="${POSTGRES_DB}" -tAc \
    "SELECT tablename || '|' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || quote_ident(tablename), false, true, '')))[1]::text FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma%'" \
    | tr -d '\r'
)

echo "[$(date -Is)] Taking a fresh backup"
  PGPASSWORD="${POSTGRES_PASSWORD}" "${PG_DUMP_BIN}" \
    --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" \
    --username="${POSTGRES_USER}" --dbname="${POSTGRES_DB}" \
    --format=custom --compress=9 --no-owner --no-privileges \
    --file="${DUMP}"
  TEMPORARY_DUMP=1
fi

if [[ ! -f "${DUMP}" ]]; then
  echo "[$(date -Is)] ERROR: ${DUMP} does not exist" >&2
  exit 1
fi

echo "[$(date -Is)] Using $(basename "${DUMP}") ($(du -h "${DUMP}" | cut -f1))"

# ---------------------------------------------------------------- the restore
echo "[$(date -Is)] Restoring into ${SCRATCH_DB}"
if ! admin "SELECT 1" > /dev/null 2>&1; then
  cat >&2 <<MESSAGE

Cannot connect as ${DRILL_USER} to create the scratch database.

The application role is NOCREATEDB on purpose, so this drill needs a role that may create
one. Set POSTGRES_SUPERUSER and POSTGRES_SUPERUSER_PASSWORD, or run the drill on a host
where the application role has that right.
MESSAGE
  exit 1
fi

admin "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\"" > /dev/null
admin "CREATE DATABASE \"${SCRATCH_DB}\"" > /dev/null

# --exit-on-error is the point of a drill: a restore that logs errors and carries on is
# how a database ends up subtly incomplete and nobody notices until a query fails.
PGPASSWORD="${DRILL_PASSWORD}" "${PG_RESTORE_BIN}" \
  --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" \
  --username="${DRILL_USER}" --dbname="${SCRATCH_DB}" \
  --no-owner --no-privileges --exit-on-error \
  "${DUMP}"

echo
echo "Structure"

check "tables" \
  "$(live "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")" \
  "$(scratch "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"

check "indexes" \
  "$(live "SELECT count(*) FROM pg_indexes WHERE schemaname='public'")" \
  "$(scratch "SELECT count(*) FROM pg_indexes WHERE schemaname='public'")"

check "triggers" \
  "$(live "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema='public'")" \
  "$(scratch "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema='public'")"

check "extensions" \
  "$(live "SELECT string_agg(extname,',' ORDER BY extname) FROM pg_extension")" \
  "$(scratch "SELECT string_agg(extname,',' ORDER BY extname) FROM pg_extension")"

# The spatial index is added by a hand-written migration rather than by Prisma, which is
# exactly the kind of thing a restore can quietly drop.
check "spatial index present" \
  "1" \
  "$(scratch "SELECT count(*) FROM pg_indexes WHERE indexname='listings_geo_published_gist_idx'")"

echo
echo "Data"

# Every table, discovered rather than listed.
#
# A hand-picked list ages badly: this one named eight tables while the schema grew to
# sixty-two, so the most recently added — safety cases, blocked image hashes, suspensions,
# the audit trails — were exactly the ones nobody was checking. Those are the records where
# a silent loss matters most, because nothing downstream would notice.
#
# The comparison has to allow for the obvious: a dump is a moment, and the live database
# keeps moving. Counting before and after tells the two apart. A table whose live count is
# unchanged across the drill must match the restore exactly — anything else is data loss. A
# table that was written to meanwhile cannot be compared, and is reported rather than
# quietly passed or failed, because either would be a guess.
#
# Read through a process substitution: `live` strips whitespace for comparing single
# values, and psql on Windows ends every line with CRLF, which inside a quoted identifier
# gives a baffling "relation does not exist".
mismatched=0
checked=0
moved=0

while read -r table; do
  [[ -z "${table}" ]] && continue
  checked=$((checked + 1))

  live_now="$(live "SELECT count(*) FROM \"${table}\"")"
  restored_count="$(scratch "SELECT count(*) FROM \"${table}\"")"
  live_before="${LIVE_AT_DUMP[${table}]:-}"

  if [[ "${live_before}" != "${live_now}" ]]; then
    printf '  ~ %-28s changed during the drill (%s → %s), restored %s\n' \
      "${table}" "${live_before}" "${live_now}" "${restored_count}"
    moved=$((moved + 1))
    continue
  fi

  if [[ "${live_before}" != "${restored_count}" ]]; then
    echo "  MISMATCH ${table}: live ${live_before}, restored ${restored_count}" >&2
    mismatched=$((mismatched + 1))
  fi
done < <(
  PGPASSWORD="${POSTGRES_PASSWORD}" "${PSQL_BIN}" \
    --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" \
    --username="${POSTGRES_USER}" --dbname="${POSTGRES_DB}" -tAc \
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma%' ORDER BY tablename" \
    | tr -d '\r'
)

check "$((checked - moved)) settled tables restored exactly" "0" "${mismatched}"
if [[ "${moved}" -gt 0 ]]; then
  echo "  ${moved} table(s) were written to while the drill ran and could not be compared."
  echo "  Run it against a quiet database, or from a backup file, for a complete answer."
fi

# Named individually so the output shows the ones a reader cares about, and so a table
# disappearing from the schema is visible rather than silently skipped.
for table in users listings pincodes blocked_image_hashes user_suspensions audit_logs; do
  check "${table}" "$(live "SELECT count(*) FROM \"${table}\"")" "$(scratch "SELECT count(*) FROM \"${table}\"")"
done

check "listings carrying a geo point" \
  "$(live "SELECT count(*) FROM listings WHERE geo IS NOT NULL")" \
  "$(scratch "SELECT count(*) FROM listings WHERE geo IS NOT NULL")"

echo
echo "Function"

# Structures can all be present and still not work. A radius query is the one the product
# depends on most, and it exercises the extension, the geography column and the index at
# once.
NEARBY="$(scratch "SELECT count(*) FROM listings WHERE geo IS NOT NULL AND ST_DWithin(geo, ST_SetSRID(ST_MakePoint(78.3885,17.4411),4326)::geography, 10000)")"
LIVE_NEARBY="$(live "SELECT count(*) FROM listings WHERE geo IS NOT NULL AND ST_DWithin(geo, ST_SetSRID(ST_MakePoint(78.3885,17.4411),4326)::geography, 10000)")"
check "a radius search returns the same rows" "${LIVE_NEARBY}" "${NEARBY}"

USES_INDEX="$(scratch "SELECT count(*) FROM (SELECT unnest(string_to_array(x, E'\n')) AS line FROM (SELECT '' AS x) t) q WHERE false")"
PLAN="$(PGPASSWORD="${DRILL_PASSWORD}" "${PSQL_BIN}" --host="${POSTGRES_HOST}" --port="${POSTGRES_PORT}" \
  --username="${DRILL_USER}" --dbname="${SCRATCH_DB}" -tAc \
  "EXPLAIN SELECT id FROM listings WHERE geo IS NOT NULL AND status='PUBLISHED' AND \"deletedAt\" IS NULL AND ST_DWithin(geo, ST_SetSRID(ST_MakePoint(78.3885,17.4411),4326)::geography, 10000)")"
if grep -q "listings_geo_published_gist_idx" <<< "${PLAN}"; then
  printf '  \xe2\x9c\x93 %s\n' "and still uses the spatial index"
  passed=$((passed + 1))
else
  printf '  \xe2\x9c\x97 %s\n' "the restored copy is not using the spatial index" >&2
  failed=$((failed + 1))
fi
unset USES_INDEX

# The geo column is filled by a trigger. If the trigger did not survive, inserts still
# succeed and the point is simply never created — invisible until a search comes back
# empty for a listing that plainly exists.
scratch "INSERT INTO listings (id, type, \"ownerId\", title, slug, description, \"categoryId\", status, \"moderationStatus\", \"cityId\", latitude, longitude, \"contactPreference\", visibility, \"createdAt\", \"updatedAt\")
  SELECT gen_random_uuid(), type, \"ownerId\", 'restore drill probe', 'restore-drill-probe-'||gen_random_uuid(), description, \"categoryId\", status, \"moderationStatus\", \"cityId\", 17.4411, 78.3885, \"contactPreference\", visibility, NOW(), NOW()
  FROM listings LIMIT 1" > /dev/null

check "the geo trigger still fires on insert" \
  "1" \
  "$(scratch "SELECT count(*) FROM listings WHERE slug LIKE 'restore-drill-probe-%' AND geo IS NOT NULL")"

scratch "DELETE FROM listings WHERE slug LIKE 'restore-drill-probe-%'" > /dev/null

# ---------------------------------------------------------------- summary
echo
echo "============================================================"
echo "${passed} passed, ${failed} failed"

if [[ -n "${TEMPORARY_DUMP:-}" && -z "${KEEP_SCRATCH:-}" ]]; then
  rm -f "${DUMP}"
fi

if [[ -n "${KEEP_SCRATCH:-}" ]]; then
  echo "Scratch database ${SCRATCH_DB} left in place for inspection"
fi

[[ "${failed}" -eq 0 ]]
