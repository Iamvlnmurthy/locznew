# Audit findings and remaining work

Written 2 August 2026, at the end of a long session. Everything below is verified state, not
plan. It exists so the next session starts from facts rather than rediscovering them.

## The pattern worth carrying forward

Three defects found today shared one shape: **backend capability built and tested, with no way
for a person to reach it.**

| Defect | How long it existed |
|---|---|
| `clearSession()` existed; nothing called it. No sign-out anywhere in the app. | Since sessions were added |
| `PATCH /users/me` existed; nothing called it. Nobody could edit their own name or email. | Since users were added |
| `/chats`, `/business`, `/location`, `/account/phone` were unlinked. Messages unreachable. | Since each route was built |

All three are fixed. The lesson is that 505 passing tests verify services behave correctly in
isolation, which is **not** the same as verifying somebody can use them. The check that would
have caught all three is a signed-in walkthrough on a real device, and it has still not been
done.

Two further defects were introduced *during* the fixes, both from linking to a route by name
without checking what it rendered:

- "Your businesses" pointed at `/business`, the public directory of every business
- A link to `/b/[slug]/claim`, a page that does not exist — shipped a 404

Both fixed. Check what a route renders, not just that it resolves.

## Verified working

- 505 API tests, 50 Flutter tests, `flutter analyze` clean
- i18n complete in English, Hindi and Telugu; `check-i18n` passes
- Deployed acceptance gate: 22 checks pass; one correctly reports "no published listing in this
  area to verify sharing with" since the demo data was removed
- No auth leaks: `/dashboard`, `/chats`, `/account/phone` render a signed-out state
- Firebase phone verification proven end to end against a real Google-signed token:
  `VERIFIED: { phoneE164: '+919966577659', firebaseUid: 'sMTJMeP5RBQjK2ZtrAAW5NbBGmF2' }`

## Not verified

**A signed-in walkthrough on a device.** Routes were checked for response codes and leaks, not
for whether each screen works when logged in. Start here.

## Remaining work, in priority order

1. **`/b/[slug]/claim`** — the page does not exist. The API is live and complete:
   `POST /businesses/:id/claims` taking `evidence` (min 20 chars), `scale`, `offering`,
   optional `categoryId`, `contactPhone`, and optional `latitude`/`longitude`/
   `locationAccuracyM`. Sending a location fix within 50 m plus one other verified signal
   auto-approves. The business page currently links to `/business/new` as a stopgap.

2. **"Ask if they stock this"** — the whole backend loop exists and nothing calls it. Create a
   `BUYER_REQUIREMENT` listing carrying `promptedByBusinessId`. It fans out to nearby claimed
   sellers, and `GET /businesses/:id/enquiries/count` turns those into the claim pitch.

3. **Distance on the business page** — needs browser geolocation on the client. The maps
   directions link already works.

4. **`noindex` on unclaimed records** — four million near-identical templated pages is a
   doorway pattern search engines penalise. Index a record once it has a claim or real query
   demand, not before.

5. **Location permission, done contextually** — see below.

6. **Firebase Blaze plan** — owner action. Real numbers cannot verify without it. The test
   number `+91 9966577659` / `123456` works now and needs no billing.

## On location permissions

Asking at install is not possible: Android has granted permissions at runtime since version 6.
Asking at first launch is possible but harmful — cold-start prompts are granted roughly half as
often as contextual ones, Play review flags location requests with no visible reason, and
Android stops showing the dialog permanently after two denials, so a user who taps Deny twice
can only re-enable it from system Settings.

Build it contextually instead: ask when somebody does something location-shaped, and on refusal
show what to do next. LocZ already has the alternative — the pincode chip — so a refusal is not
a dead end. Permanent denial needs different copy from a first refusal, because "Allow" will
not appear again; offer `openAppSettings()` and the pincode picker side by side.

## What the audit should have been

The first pass checked that routes return 200 and that no protected page leaks data, then
reported itself as a full review. That is a smoke test, not an audit. The owner found three
real defects in three minutes afterwards, which is the correct verdict on the method.

A real audit exercises each **feature** end to end with real data, signed in, in a browser or
on a device. Route coverage and unit tests do not substitute: every defect below passed both.

### Found immediately after, by using the app

**Every uploaded image is stuck in quarantine.** 100% of production media sits in
`REVIEW_REQUIRED` under `quarantine/listings/...`. The safety pipeline holds uploads until a
scanner clears them; the scanner is configured but unreachable, so nothing is ever released.
The upload succeeds, the listing publishes, and the only symptom is a grey placeholder. No
error, no alert. Either make the scanner reachable or let an unavailable scanner fail open for
low-risk uploads — a safety feature that silently traps all media is an outage wearing a
feature's clothes.

**Google One Tap fires on page load and leaves an error on arrival.** It auto-triggers, fails
for an address with no LocZ account, and sets the error state before the visitor has done
anything. Both auth pages show a red notice on arrival. An earlier check of this concluded it
was correct because the notice only renders when `state.error` is set — true, and irrelevant,
because One Tap sets it unprompted.

### The checklist a real audit needs

Signed in, on a device, with real data. For each: does it work, and does it tell the truth when
it fails?

post an ad · upload images and see them appear · edit an ad · delete an ad · search by keyword ·
search by category and attribute filters · switch area by pincode · switch area by location ·
open a listing · save a listing · share a listing · message a seller · reply · notifications ·
create a business · edit a business · claim a business · confirm a mobile number · sign up ·
sign in by email · sign in with Google · reset a password · change your details · sign out ·
switch language to Hindi and Telugu · every admin queue

Anything that cannot be exercised is not "done".
