# Troubleshooting

Failures are grouped by where they surface. Each entry gives the symptom, the cause, and
the fix — not a generic "check your configuration".

---

## Startup

### `Invalid environment configuration: JWT_ACCESS_SECRET must be at least 32 characters`

The API validates its environment at import time and refuses to boot on a bad value.
Generate real secrets (see [SETUP.md](SETUP.md#1-environment)). This is deliberate: a
missing secret must fail at startup, never as a 500 in live traffic.

### `OTP_PROVIDER=mock is not permitted when NODE_ENV=production`

Working as intended. The mock provider returns the verification code in the API response;
shipping that live would let anyone sign in as anyone. Set `OTP_PROVIDER=msg91` and
supply `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID`.

### API starts, then exits with `Can't reach database server at localhost:5432`

Postgres is not up yet. `docker compose ... ps` should show `healthy`, not `starting`.
On first run the PostGIS image takes 20–30 seconds to initialise.

### `Environment variable not found: DATABASE_URL` from a Prisma command

Prisma reads `.env` from its own directory. Run Prisma commands through the workspace
script (`npm run db:migrate`) rather than invoking `npx prisma` from `apps/api` directly,
or export `DATABASE_URL` in that shell first.

---

## Database

### `type "geography" does not exist`

PostGIS was not enabled before the first migration. The extension SQL in
`infrastructure/database/init/` runs **only on first initialisation of the data volume**
— if the volume already existed from a plain `postgres` image, it never ran.

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml down -v
npm run docker:up && npm run db:migrate
```

### Nearby search returns nothing, or is very slow

Three separate causes, in order of likelihood:

1. **`geo` is null.** It is derived by trigger from `latitude`/`longitude`. Rows inserted
   before the second migration have no trigger applied. Force a re-derive:
   ```sql
   UPDATE listings SET latitude = latitude WHERE geo IS NULL AND latitude IS NOT NULL;
   ```
2. **GiST index missing** — check `\d listings` for `listings_geo_gist_idx`. Without it
   every radius query is a sequential scan.
3. **Coordinates swapped.** `ST_MakePoint` takes **longitude first**. A Hyderabad listing
   at `(17.4, 78.5)` is in India; at `(78.5, 17.4)` it is in the Indian Ocean and matches
   nothing.

### `Unique constraint failed on saved_locations_one_default_per_user_idx`

Two saved locations were marked default. The API clears the previous default inside the
same transaction; a direct SQL insert bypassing that hits the partial unique index. Fix
the data, don't drop the index — it exists because the API is not the only possible writer.

---

## Search

### Search returns results that no longer exist, or misses new listings

Meilisearch is a derived index; drift is expected briefly. Check the gap in the admin
console under **System**, then press **Rebuild search index**. A rebuild is always safe —
PostgreSQL is the source of truth, so nothing can be lost.

### `usedSearchIndex: false` on every response

The API could not reach Meilisearch and fell back to the database. Results are still
correct, just without typo tolerance and relevance ranking. Check
`curl http://localhost:7700/health` and that `MEILI_MASTER_KEY` matches on both sides.

### Nothing indexes at all

Indexing runs through BullMQ. If Redis is down the publisher swallows the enqueue failure
by design — a Redis blip must not fail a user's listing save. Check queue depth under
**System** in the console; the nightly rebuild at 04:00 IST repairs anything missed.

---

## Media

### Upload returns 403 from MinIO

The signed URL binds the `Content-Type`. The client must send **exactly** the MIME type
it declared when requesting the URL. `image/jpg` and `image/jpeg` are different strings.

### Image confirms but no thumbnail appears

`confirmUpload` re-validates the real file by magic bytes and deletes anything that is not
a supported image, whatever the declared type said. Check `listing_media.failureReason`.
Common cause: a HEIC file from an iPhone renamed to `.jpg`.

### `sharp` fails to load

Native binary mismatch, usually after copying `node_modules` between platforms or an
interrupted install:

```bash
npm rebuild sharp argon2
```

---

## Authentication

### Signed out unexpectedly on mobile

Refresh tokens rotate, and presenting an already-rotated one is treated as theft — the
whole session family is revoked. The usual innocent cause is parallel refreshes; the
Flutter `ApiClient` guards against this with a single-flight refresh. If it recurs, check
that guard is intact rather than relaxing the rotation policy.

### `This number is temporarily locked`

Five failed OTP attempts triggers a 15-minute lockout, stored in the database so it
survives a restart. To clear during development:

```sql
DELETE FROM auth_lockouts WHERE identifier = '+919876543210';
```

### Admin console shows "does not have access"

The account lacks `listing:moderate` and `metrics:read`. Grant a role:

```sql
INSERT INTO user_roles ("userId", "roleId")
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'you@example.com' AND r.name = 'ADMINISTRATOR';
```

Then sign out and in again — permissions are carried in the access token, so a role change
takes effect at the next refresh (≤15 minutes), not instantly.

---

## Moderation

### Every listing goes to review

Expected for new accounts: the first two listings from any account always get human eyes.
It is the single most effective brake on a free-posting spam wave. Tune with the
`moderation.requireReviewForFirstNListings` system setting.

### A legitimate listing was auto-rejected

Check `moderation_actions.systemReasons` for that listing. Severity-2 banned keywords
reject on their own; everything else has to accumulate past 80. Adjust the keyword's
severity in `banned_keywords` — no deployment needed.

---

## Web and admin

### Listing page shows stale data after an edit

Listing detail is fetched with `auth: true`, which forces `no-store`, so it should never
be stale. Category and city pages _are_ cached (1 hour / 24 hours) — that is intentional
for crawlability. Call `revalidateTag('categories')` after an admin change.

### `fetch failed` in the browser, but curl works

The Next.js server calls the API from inside the container network in production, and
from the host in development. `NEXT_PUBLIC_API_BASE_URL` must be reachable from whichever
side is making the call.

---

## Mobile

### Cannot reach the API from an emulator

`localhost` inside an emulator is the emulator. Use `10.0.2.2` for Android, and the
host's LAN address for a physical device:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

### Location permission granted but the city never resolves

`/locations/resolve` returns `city: null` beyond 150 km from any launched city — by
design, so a user in Delhi is not silently browsing Hyderabad. Seed more cities or set
`isLaunched = true` on one nearby.

### Push notifications never arrive

In order: is `FCM_PROJECT_ID` set on the API; did the device register a token
(`SELECT "pushToken" FROM devices`); has the user disabled that type in
`notification_preferences`; and is the worker running — delivery is queued, not inline.
