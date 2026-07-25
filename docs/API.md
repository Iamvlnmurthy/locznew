# API

Base URL `/{prefix}/v1` — `http://localhost:4000/api/v1` in development.

Interactive documentation is served at **`/api/docs`** in every environment except
production, where publishing the full surface is an unnecessary disclosure. The generated
contract is committed at [`openapi.json`](openapi.json) — **80 paths, 78 schemas** —
so an API change shows up as a diff in review. Regenerate it with:

```bash
npm run openapi -w @locz/api
```

---

## Conventions

### Response envelope

Success:

```json
{ "success": true, "data": {}, "correlationId": "3f7c…" }
```

Failure:

```json
{
  "success": false,
  "error": { "code": "NotFound", "message": "Listing not found", "details": [] },
  "correlationId": "3f7c…",
  "timestamp": "2026-07-26T09:14:22.031Z",
  "path": "/api/v1/listings/abc"
}
```

`error.code` is normalised — no spaces, PascalCase — regardless of which layer raised it,
so a client may switch on it. `details` carries every validation failure so a form can
flag each field at once.

### Authentication

Authentication is **on by default**; a route is public only if it opts out. Send:

```
Authorization: Bearer <accessToken>
```

Access tokens last 15 minutes. Refresh tokens are opaque, rotate on every use, and are
revoked as a family if an already-rotated one is presented (ADR-0007). Concurrent
refreshes must be collapsed into one request — the Flutter client does this with a
single-flight guard, and any other client needs the same.

### Correlation ids

Send `X-Correlation-Id` and it is echoed back, written into audit entries and attached to
error reports. Omit it and one is generated. It is what makes a user-reported failure
traceable across API, worker and console.

### Idempotency

Send `Idempotency-Key` on POST/PATCH/PUT to make a retry safe (ADR-0010). The first
request's response is replayed for 24 hours; a repeat arriving while the original is still
running gets `409`. Worth using on listing creation, where a lost response on a mobile
connection otherwise produces two identical ads.

### Pagination

`?page=1&limit=20`, capped at 50. Paginated responses carry:

```json
{
  "items": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 1, "hasNextPage": false }
}
```

### Rate limits

| Scope                    | Limit                                                      |
| ------------------------ | ---------------------------------------------------------- |
| Global per IP            | 120 requests / minute                                      |
| `POST /auth/otp/request` | 5 / minute per IP, 3 / 10 min per phone                    |
| `POST /auth/otp/verify`  | 10 / minute; 5 wrong codes locks the number for 15 minutes |
| Enquiries                | 20 / hour per user                                         |
| Reports                  | 10 / hour per user                                         |
| Listing creation         | per-role daily cap from `posting.limits.perRolePerDay`     |

Exceeding one returns `429` with `retryAfterSeconds`.

---

## Endpoint groups

| Prefix           | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `/auth`          | OTP request and verify, email sign-in, refresh, logout, logout-all |
| `/users`         | Profile, devices, push token, deactivate, deletion request         |
| `/locations`     | Cities, localities, coordinate resolution, saved locations         |
| `/categories`    | Category tree and dynamic attribute definitions                    |
| `/listings`      | Create, browse, detail, lifecycle, save, my listings               |
| `/search`        | Keyword search, index status, rebuild                              |
| `/feed`          | Location-aware home feed                                           |
| `/media`         | Signed upload URLs, confirmation, ordering                         |
| `/conversations` | Enquiry threads, messages, blocking                                |
| `/notifications` | Centre, unread count, preferences                                  |
| `/businesses`    | Registration, staff, verification                                  |
| `/reports`       | User reports and moderator resolution                              |
| `/moderation`    | Review queue, approve, reject, remove                              |
| `/admin`         | Metrics, users, audit trail, queue and storage health              |
| `/health`        | `live` and `ready` probes                                          |

## Public versus authenticated

Reading is public. Listing detail, category pages, city pages, search and the feed all
work signed out — that is what makes the site indexable and what lets a shared link open
without a sign-up wall.

Authentication is required to post, save, message, report, or manage anything.

Some routes are **optionally** authenticated: `/listings`, `/listings/:slug`, `/search`
and `/feed` return extra state (`isSaved`, personalised sections) when a token is present
and work identically without one.

## Typed client

`@locz/api-client` wraps the common endpoints for web and admin (ADR-0011):

```ts
import { LoczClient } from '@locz/api-client';

const locz = new LoczClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL!,
  getToken: () => getAccessToken(),
});

const queue = await locz.moderation.queue({ page: 1, limit: 20 });
```

Validation schemas are shared separately through `@locz/validation`, so a form rejects bad
input using exactly the rules the API will apply.
