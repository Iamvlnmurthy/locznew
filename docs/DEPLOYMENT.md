# Production deployment

LocZ ships as one Docker Compose stack: Nginx, API, worker, web, admin, PostGIS,
Redis and Meilisearch. PostgreSQL is the source of truth; R2-compatible object storage
is external.

## 1. Host and DNS

Provision a Linux host with Docker Engine and the Compose plugin. Point `locz.in`,
`www.locz.in` and `admin.locz.in` to it before requesting TLS certificates. Keep ports
80 and 443 open; do not expose PostgreSQL, Redis or Meilisearch.

## 2. Production environment

Compose reads `infrastructure/docker/.env`, not the repository-root `.env`:

```bash
cp .env.example infrastructure/docker/.env
chmod 600 infrastructure/docker/.env
```

Replace every development value. Use different random values of at least 32 characters
for both JWT secrets, a non-mock SMS provider, R2 credentials and a strong Meilisearch
key. Public Next.js values are embedded during image build and must use the final HTTPS
URLs.

Run the preflight before building:

```bash
npm run preflight:production -- --dns
```

It prints variable names and results only—never secret values.

## 3. First TLS certificate

The main Nginx configuration requires a certificate at startup. Bootstrap HTTP first:

```bash
docker run --rm -d --name locz-acme-bootstrap \
  -p 80:80 \
  -v "$PWD/infrastructure/nginx/acme-bootstrap.conf:/etc/nginx/nginx.conf:ro" \
  -v "$PWD/infrastructure/docker/certbot/www:/var/www/certbot" \
  nginx:1.29-alpine

docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --profile maintenance run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d locz.in -d www.locz.in -d admin.locz.in \
  --email YOUR_OPERATIONS_EMAIL --agree-tos --no-eff-email

docker stop locz-acme-bootstrap
```

Rerun the preflight; both certificate checks must pass.

## 4. Build, migrate and start

Back up the database before every release. Then build the exact source state and let the
one-shot migration service finish before API traffic starts:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml build --pull
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d
docker compose -f infrastructure/docker/docker-compose.prod.yml ps
```

Verify both API probes:

```bash
curl --fail https://locz.in/api/v1/health/live
curl --fail https://locz.in/api/v1/health/ready
```

Then run the production smoke with a dedicated admin test account:

```bash
LOCZ_SMOKE_ADMIN_EMAIL=release-check@locz.in \
LOCZ_SMOKE_ADMIN_PASSWORD='read-from-your-secret-manager' \
npm run smoke:production
```

The smoke checks TLS headers, API liveness/readiness, Meilisearch usage and drift, the
admin host's anti-indexing/frame headers, hidden production API docs, and logout cleanup.
Set `LOCZ_SMOKE_MAX_INDEX_DRIFT` only when a documented release permits temporary drift.
`LOCZ_API_URL` may override the default `${LOCZ_PRODUCTION_URL}/api/v1` for a preview
whose API uses a separate origin.
Run the broader acceptance gates against production-like URLs before switching traffic.

## 5. Certificate renewal

Run this from a systemd timer or cron at least daily:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml \
  --profile maintenance run --rm certbot renew --webroot -w /var/www/certbot
docker compose -f infrastructure/docker/docker-compose.prod.yml exec nginx nginx -s reload
```

Certbot exits successfully when no certificate is due; reloading Nginx is safe.

## 6. Release and rollback

Record the Git commit and image digests used for every release. Database migrations must
be backward-compatible with the previous application image. To roll back, deploy the
previous image set and keep the migrated schema; never restore an old database merely to
match old code unless a separately tested disaster-recovery procedure requires it.

After deployment, check Nginx/API error logs, queue failures, Sentry, SMS delivery and
push delivery. A green health endpoint proves dependencies are reachable, not that a
buyer can complete a journey.
