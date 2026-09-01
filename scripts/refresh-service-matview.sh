#!/usr/bin/env bash
# Refresh the service-area SEO materialized view (powers /services/[category]/[area] + its sitemap).
# The view aggregates ~service providers with a phone, grouped by category x locality, HAVING >=5.
# It answers in ~40ms vs ~11.7s for the live aggregation, so pages and sitemap read it, not the join.
# It only goes stale as service providers are imported/claimed, so a daily refresh is plenty.
#
# CONCURRENTLY needs the unique index (service_area_pages_pk) — present — so reads never block during
# the refresh. Install as a daily cron (root), e.g.:
#   15 3 * * * /home/locz/app/scripts/refresh-service-matview.sh >> /var/log/locz-matview.log 2>&1
set -euo pipefail
echo "[$(date -Is)] refreshing service_area_pages ..."
docker exec locz-postgres psql -U locz -d locz -c \
  "REFRESH MATERIALIZED VIEW CONCURRENTLY service_area_pages;"
echo "[$(date -Is)] done: $(docker exec locz-postgres psql -U locz -d locz -tA -c \
  'SELECT count(*) FROM service_area_pages;') pages"
