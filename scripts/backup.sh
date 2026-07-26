#!/usr/bin/env bash
#
# PostgreSQL backup for LocZ.
#
#   ./scripts/backup.sh                 # back up using .env
#   ./scripts/backup.sh /path/to/dir    # back up to a specific directory
#
# Uses pg_dump's custom format (-Fc): compressed, and restorable table-by-table with
# pg_restore, which matters when you need one table back rather than the whole database.
#
# Run from cron on the database host:
#   0 2 * * * /srv/locz/scripts/backup.sh >> /var/log/locz-backup.log 2>&1

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${1:-${ROOT_DIR}/infrastructure/docker/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

# shellcheck disable=SC1091
if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a && source "${ROOT_DIR}/.env" && set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is not set}"
: "${POSTGRES_DB:?POSTGRES_DB is not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set}"

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="${BACKUP_DIR}/locz-${TIMESTAMP}.dump"

echo "[$(date -Is)] Backing up ${POSTGRES_DB} from ${POSTGRES_HOST}:${POSTGRES_PORT}"

# Written to .partial first and renamed on success, so an interrupted run never leaves a
# truncated file that looks like a usable backup.
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="${TARGET}.partial"

mv "${TARGET}.partial" "${TARGET}"

SIZE="$(du -h "${TARGET}" | cut -f1)"
echo "[$(date -Is)] Wrote ${TARGET} (${SIZE})"

# A dump that pg_restore cannot read is not a backup. Listing its contents is cheap and
# catches a corrupt or truncated file immediately rather than during an incident.
if ! pg_restore --list "${TARGET}" > /dev/null 2>&1; then
  echo "[$(date -Is)] ERROR: ${TARGET} is not readable by pg_restore — backup FAILED" >&2
  exit 1
fi

TABLE_COUNT="$(pg_restore --list "${TARGET}" | grep -c 'TABLE DATA' || true)"
echo "[$(date -Is)] Verified: ${TABLE_COUNT} tables in the dump"

# Sanity floor, kept deliberately loose. The schema grows, and a backup script that has to
# be edited every time a model is added is one that eventually gets edited wrongly. What
# this catches is the case that matters: a dump with a handful of tables means someone
# pointed it at the wrong database, and rotating on that would age out the real backups.
if [[ "${TABLE_COUNT}" -lt 20 ]]; then
  echo "[$(date -Is)] ERROR: only ${TABLE_COUNT} tables — wrong database? Not rotating." >&2
  exit 1
fi

echo "[$(date -Is)] Removing backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name 'locz-*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete

# Local disk is not a backup — it dies with the machine. Ship it off-box.
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "[$(date -Is)] Uploading to s3://${BACKUP_S3_BUCKET}/"
  aws s3 cp "${TARGET}" "s3://${BACKUP_S3_BUCKET}/$(basename "${TARGET}")" \
    ${BACKUP_S3_ENDPOINT:+--endpoint-url "${BACKUP_S3_ENDPOINT}"}
else
  echo "[$(date -Is)] WARNING: BACKUP_S3_BUCKET is not set — this backup lives only on this machine" >&2
fi

echo "[$(date -Is)] Done"
