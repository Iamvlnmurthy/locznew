# LocZ architecture

Rationale for individual decisions lives in [`DECISIONS.md`](../DECISIONS.md). This
document is the map.

## System

```
                    ┌──────────── Nginx ────────────┐
                    │  TLS · gzip · rate limits     │
                    │  /api → API, / → web          │
                    └───────────────┬───────────────┘
        ┌───────────────┬───────────┴───────┬────────────────┐
   Web (Next)     Admin (Next)         Mobile (Flutter)      │
        └───────────────┴───────────────────┴────────────────┘
                                │  REST /api/v1
                    ┌───────────▼────────────┐
                    │  NestJS modular monolith│
                    └───────────┬────────────┘
        ┌──────────┬────────────┼────────────┬─────────────┐
   PostgreSQL    Redis      BullMQ workers  Meilisearch   R2 / MinIO
   + PostGIS   cache+queues  (same image)   (derived)     (media)
   ── truth ──                                └── disposable ──
```

**One writer.** No client touches the database or the search index. Business logic lives
in Nest modules, never in a Next.js server action — which is why the same rules apply
identically to web, admin and mobile.

## Modules

| Module              | Responsibility                                                 |
| ------------------- | -------------------------------------------------------------- |
| `config`            | Zod-validated environment; aborts boot on a bad value          |
| `prisma`            | Client + `GeoRepository`, the only PostGIS SQL in the codebase |
| `redis`             | Cache, fixed-window counters, idempotency keys                 |
| `auth` / `auth/otp` | OTP issue+verify, token rotation, device registration          |
| `rbac`              | Fail-closed JWT guard, permission guard, role resolution       |
| `users`             | Profile, devices, push tokens, account lifecycle               |
| `geo`               | Cities, localities, saved locations, coordinate resolution     |
| `categories`        | Category tree and dynamic attribute definitions                |
| `listings`          | The unified listing engine + keyword search facade             |
| `media`             | Signed uploads, validation, rendition generation               |
| `moderation`        | Provider interface, rules engine, review queue                 |
| `search`            | Meilisearch documents, indexing worker, rebuild                |
| `feed`              | Location-aware home feed                                       |
| `conversations`     | Enquiry threads, blocking                                      |
| `notifications`     | In-app, push, preference matrix                                |
| `lifecycle`         | Expiry, warnings, orphan sweeps, nightly reindex               |
| `admin`             | Metrics, user directory, queue and storage health              |
| `audit`             | Append-only trail with field redaction                         |

Modules communicate through injected services, or asynchronously through BullMQ events
(`listing.published`, `media.uploaded`, `moderation.decided`). Those queues are the seam
along which a module can later become a service without a rewrite.

## Data

52 models (53 tables — PostGIS adds `spatial_ref_sys`). The shape that matters: **one `Listing` table carrying the common contract,
with a thin 1:1 extension table per type.** Nine listing types share ~25 fields — owner,
location, moderation state, lifecycle, counters — and diverge on about ten each. One
table with 200 columns and nine parallel implementations are both worse.

Genuinely dynamic, admin-defined fields live in `ListingAttributeValue` keyed by
`CategoryAttribute`, so an administrator can add "Fuel type" to Cars and it appears in
the posting form on web and mobile with no client release.

### Pincode as the location primitive

LocZ serves every pincode in India — all 19,238 of them, imported from GeoNames into the
`pincodes` table with a centroid, district, state and office count per code.

A pincode is treated as **a point with a radius, not a boundary**. Post office boundaries
are not published as usable geometry, and a user in 500081 will happily cross the street
into 500084, so a "pincode search" resolves the code to its centroid and runs the ordinary
PostGIS radius query (10 km by default). One code path serves GPS and pincode alike; the
pincode is simply another way to obtain coordinates — and the way most users prefer, since
everyone knows their own and nobody has to grant a location permission.

The same primitive works when posting: supply `pincodeCode` on a listing and its centroid
becomes the coordinates. Precision order is _poster-supplied coordinates → pincode centroid
→ city centre_, so a listing is always placeable and always reachable by radius search.

Indexing decisions are documented inline in `schema.prisma` and in the second migration.
The ones that carry the product: `GIST(listings.geo)` for every nearby query, the
composite `(type, status, cityId, publishedAt DESC)` covering the home feed and city
landing pages, and partial indexes so each background sweeper scans only rows that can
actually be due.

## Request path

```
Nginx (rate limit, correlation id)
  → CorrelationIdMiddleware
  → ThrottlerGuard        throttle before doing work
  → JwtAuthGuard          global, fail-closed; verifies the session is still live
  → PermissionsGuard      permissions carried in the token
  → ValidationPipe        whitelist + reject unknown properties
  → Controller → Service → Prisma / Redis / Queue
  → ResponseInterceptor   { success, data }
  → AllExceptionsFilter   { success: false, error: { code, message } }
```

Authentication is on by default. A new endpoint written without thinking about auth is
protected, not exposed — opting out takes an explicit `@Public()`.

## Security model

| Concern              | Mechanism                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Session theft        | Opaque refresh tokens, stored hashed, rotated on use, family revoked on reuse             |
| Immediate revocation | The auth guard checks session liveness per request, so "log out everywhere" is real       |
| Brute force          | Per-phone and per-IP OTP limits in Redis, plus a DB-backed lockout that survives restarts |
| Spam                 | Rules moderation before publication, per-role daily posting caps, enquiry rate limits     |
| Upload abuse         | Signed URLs bound to a declared MIME type; magic bytes re-checked after upload            |
| Privacy              | EXIF stripped from every image; phone numbers hidden unless the owner opts in             |
| XSS                  | React escaping plus a strict CSP on admin, which renders unmoderated content              |
| Injection            | Prisma parameterisation; the one raw-SQL file uses bound `Prisma.sql` fragments           |
| Secrets              | Environment only; nothing in `NEXT_PUBLIC_*`; audit entries redact token fields           |

## Deployment

`docker compose -f infrastructure/docker/docker-compose.prod.yml up -d --build`

Migrations run as a one-shot service that must complete before the API starts, so a
container can never serve traffic against a schema older than its code. The worker shares
the API image and module graph, started without an HTTP server.

Only Nginx publishes ports. Postgres, Redis and Meilisearch are reachable on the compose
network alone.

## What Phase 2 should pick up

1. **Payments** — the schema is ready (`Plan`, `Subscription`, `FeaturedPlacement`,
   `BoostOrder`); no endpoint activates them.
2. **The remaining listing types.** Rental, event, service and business-listing tables
   exist and the engine handles them; only marketplace has full client flows.
3. **AI moderation** behind the existing `ModerationProvider` interface.
4. **Saved-search alerts** — `SearchSubscription` is modelled; the matcher job is not built.
5. **Read replicas** once city count grows; the geo queries are the first to feel it.
6. **Splitting the worker out** if image processing starts competing for CPU — the queue
   boundary already exists.
