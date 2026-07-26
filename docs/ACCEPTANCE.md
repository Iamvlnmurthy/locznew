# Phase 1 acceptance — end-to-end marketplace flow

The gate for calling Phase 1 complete. Every step below has been implemented; **none of
it has been executed**, because this repository was built on a machine without Docker.
Run it on a machine that has Docker and record the result in `PROGRESS.md`.

Prerequisites: [SETUP.md](SETUP.md) steps 1–5 complete, API + web + admin running.

---

## 1. Sign in with mock OTP

1. http://localhost:3000 → **Sign in**
2. Enter `9000000004` (the seeded seller)
3. The code appears on screen in a blue panel — the mock provider returns it
4. Enter it → redirected home, header shows **My ads**

**Expect:** `POST /auth/otp/request` then `/verify` both 200. A row in `sessions` and one
in `devices`. An audit entry `auth.login`.

```sql
SELECT action, "entityType", "createdAt" FROM audit_logs ORDER BY "createdAt" DESC LIMIT 3;
```

## 2. Select a city

1. Tap the location chip in the header
2. Choose **Hyderabad** (or allow GPS — it resolves to the nearest launched city)

**Expect:** the `locz_city` cookie is set; the home feed reloads scoped to that city.

## 3. Create a marketplace listing

1. **+ Post free ad**
2. Title `Samsung 43 inch smart TV in good condition`, a category, a real description,
   a price, city Hyderabad
3. **Publish free ad**

**Expect:** status `PENDING_REVIEW`, and the pending message — _not_ "your ad is live".
The seeded seller has no published listings, and first listings always get human review.

```sql
SELECT title, status, "moderationStatus", "moderationScore" FROM listings
ORDER BY "createdAt" DESC LIMIT 1;

SELECT action, "systemReasons", "isAutomated" FROM moderation_actions
ORDER BY "createdAt" DESC LIMIT 1;   -- expect ESCALATE, ["NEW_ACCOUNT"], true
```

## 4. Upload images

On the success screen, add two or three photos.

**Expect:** a progress bar per file, then a thumbnail. The bytes go from the browser
straight to MinIO — they never pass through the Next.js server or the API.

```sql
SELECT status, "thumbKey", "cardKey", "fullKey", width, height FROM listing_media
ORDER BY "createdAt" DESC LIMIT 3;   -- expect READY and three WebP keys
```

Confirm metadata was stripped (this is a privacy requirement, not an optimisation — a
seller's home GPS must not ride along in a listing photo):

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml exec minio \
  mc cat local/locz-media/public/listings/<id>/<media>-full.webp | exiftool - | grep -i gps
# expect no output
```

## 5. Moderation queue

1. http://localhost:3001 → sign in `moderator@locz.test` / `LocZ@dev1234`
2. **Moderation queue**

**Expect:** the listing, with a **First listing** badge and the reason chip
_"First listings from this account"_.

## 6. Approve

Press **Approve & publish**.

**Expect:** status `PUBLISHED`, `publishedAt` set, an audit entry `moderation.approve`,
and a `search.index` job enqueued.

## 7. Searchable

Wait a second or two, then:

```bash
curl "http://localhost:4000/api/v1/search?q=samsung+tv" | jq '.data.total, .data.usedSearchIndex'
# expect a non-zero total and true
```

`usedSearchIndex: false` means the query fell back to PostgreSQL — correct results, but
check Meilisearch is reachable.

## 8. Visible on web and mobile

- Web: the listing appears on the home feed and at `/ad/<slug>` **without signing in**
- Page source contains `<script type="application/ld+json">` with `"@type":"Product"`
- Open Graph title, description and image are populated
- Mobile: same listing in the feed _(🟡 unverified — needs a Flutter SDK)_

## 9. Another user saves it

1. Sign out; sign in as `9000000005` (the buyer)
2. Open the listing → **Save**

**Expect:** the heart fills immediately (optimistic), a `saved_listings` row appears, and
`listings.saveCount` increments. Saving twice must **not** double-count — the unique
constraint makes it idempotent.

## 10. Send an enquiry

Press **Message seller**, send _"Is this still available?"_.

**Expect:** a `conversations` row, a `messages` row, `listings.enquiryCount` at 1. Sending
again from the same buyer continues the same thread — no duplicate conversation.

## 11. Owner is notified

Sign back in as the seller (`9000000004`).

**Expect:** an in-app notification _"New enquiry about …"_, and the thread under **Chats**.

```sql
SELECT type, title, channel, "readAt" FROM notifications ORDER BY "createdAt" DESC LIMIT 2;
-- expect NEW_ENQUIRY on IN_APP (sent immediately) and PUSH (queued)
```

The push row stays unsent without FCM credentials — expected in development.

---

## Pass criteria

| #   | Step                                                                   | Result |
| --- | ---------------------------------------------------------------------- | ------ |
| 1   | Mock OTP sign-in creates session + device                              | ☐      |
| 2   | City selection persists and scopes the feed                            | ☐      |
| 3   | Listing created, routed to review with reasons                         | ☐      |
| 4   | Images uploaded direct-to-storage, renditions generated, EXIF stripped | ☐      |
| 5   | Listing appears in the moderation queue with its flags                 | ☐      |
| 6   | Approval publishes and audits                                          | ☐      |
| 7   | Listing becomes searchable via Meilisearch                             | ☐      |
| 8   | Visible on web signed-out with correct SEO metadata                    | ☐      |
| 9   | Second user saves it; counter is idempotent                            | ☐      |
| 10  | Enquiry creates exactly one thread                                     | ☐      |
| 11  | Owner receives the notification                                        | ☐      |
| 12  | Same flow on Flutter mobile                                            | ☐      |

## Also worth checking

**Moderation actually blocks spam.** Post `INSTANT LOAN APPROVED!!! Pay advance payment,
call 9876543210 or 9876543211 bit.ly/loan` — expect `REJECTED` with several reasons. The
thresholds are pinned by tests (`npm run test -w @locz/api`).

**Expiry** is covered by `scripts/acceptance-jobs.mjs`, which no longer asks anyone to
wait fifteen minutes for the sweeper: `POST /admin/jobs/expire-listings/run` triggers it
on demand. The suite backdates one listing (the single direct database write in any of
the gates — no API backdates a record, and none should), runs the sweep, and checks the
listing turns `EXPIRED`, leaves the search index, stops serving publicly and produces a
`LISTING_EXPIRED` notification for its owner.

It needs `psql` on PATH, or `LOCZ_PSQL` pointing at it:

```bash
LOCZ_PSQL=/path/to/psql node scripts/acceptance-jobs.mjs
```

**Posting limits.** As a fresh account, post four listings — the fourth must be refused
with the daily limit message.

## Executable gates

Two scripts replace most of the manual walkthrough above. Both talk HTTP only, and both
exit non-zero on failure so they can gate a deploy.

```bash
node scripts/acceptance.mjs          # the buyer/seller flow   — 61 assertions
node scripts/acceptance-web.mjs      # the public web app      — 95 assertions
node scripts/acceptance-filters.mjs  # filter semantics        — 55 assertions
node scripts/acceptance-admin.mjs    # the admin console       — 53 assertions
node scripts/acceptance-jobs.mjs     # the background jobs     — 24 assertions
```

`acceptance-filters.mjs` exists because the others check that layers **agree**, and two
layers can agree while both are wrong — a radius search that dropped the buyer's budget
agreed perfectly with a page that rendered everything it was handed. So it trusts nothing:
it fetches the unfiltered set once, computes what each filter should return in plain
JavaScript, and holds the API to that — the exact set, an honest `total`, and the exact
order.

189 assertions in total. They need the API on :4000, web on :3000 and admin on :3001,
with `OTP_PROVIDER=mock` so a sign-in can be completed without an SMS gateway.

The admin gate checks authorisation with **negative** assertions — an ordinary account
and an anonymous request must be refused by every `/admin/*` endpoint — and checks each
console page for data that can only have come from the database. That second part
matters more than it looks: a Next.js page whose API call failed still returns HTTP 200
with an empty shell, so "the page loads" is not evidence of anything.
