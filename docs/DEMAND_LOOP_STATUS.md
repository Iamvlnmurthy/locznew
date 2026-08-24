# Demand loop — audit + status (2026-08-24)

Audited the buyer-requirement → seller-response → chat → fulfilled flow end to end, plus the
admin side. Verdict: **the backend is complete and correct**; the one real gap was admin
visibility, now filled. Remaining work is web/mobile UI polish (Codex).

## Backend — correct, complete, tested (no change needed)

`apps/api/src/requirements/` + the matcher. Verified:

- **Matcher fires only on PUBLISH** (`listings.service.ts:269`), after moderation — sellers are
  never told about an unmoderated requirement.
- **Matched on city + category**, nearest sensible v1 signal; capped at 25 sellers (notification
  fatigue); keyed per requirement so a seller with four listings hears once (`createOnce`).
- **One response per seller** (unique index); re-answering updates, doesn't spam. Count and row
  move in one transaction.
- **Sellers can't read each other's responses** (price-discovery guard); a response is private
  to the buyer.
- **Chat is routed through `ConversationsService.startRequirementThread`**, so blocking +
  rate-limit apply exactly as elsewhere (verified: `assertNotBlocked` + `assertEnquiryRateLimit`).
- **Fulfilled requirements are kept, not deleted** — unmet demand is the signal.
- `requirements.spec.ts`: **21/21**.

**Not gaps (deliberate design):** the response `message` and chat messages are _not_
pre-moderated — the platform protects private messages with blocking + reporting, not content
screening (`conversations.service` `sendMessage` only checks blocking). Consistent, so the
response needs no screening either. `searchRadiusKm` is intentionally unused by the matcher
(city+category is the honest v1); fine to leave.

## Admin — gap fixed (Claude, commit `5b556ac`, live)

The console had **no window on demand**. Added, behind `metrics:read`:

- `GET /admin/metrics/demand` → `{ openRequirements, fulfilledRequirements, unansweredRequirements,
totalResponses, newRequirementsThisWeek }`.
- `GET /admin/metrics/unmet-demand?limit=` → `[{ id, label, count }]` — categories with the most
  **unanswered** requirements: demand nobody nearby is meeting, the list ops recruits supply
  against (VISION §25).

Tested (`admin-demand.spec.ts`, 2/2), deployed, both return 401 unauth (live + protected).

## For Codex (web/mobile — your lane)

1. **Admin demand page.** A console screen consuming the two endpoints above: the five counters,
   and an "unmet demand by category" list. Sits beside the existing metrics pages. Highlight
   `unansweredRequirements` — it's the number ops acts on.
2. **Verify the user-facing requirement loop is complete.** Backend endpoints exist for every
   step (`apps/api/src/requirements/requirements.controller.ts`): respond, list responses,
   withdraw, open-chat, mark-fulfilled. Confirm the UI wires all of them —
   - a **seller** can see a nearby requirement and **respond** (kind + optional price/message);
   - the **buyer** can see responses and **open a chat** with one, and **mark fulfilled**.
     Mobile has `requirement_responses_screen.dart` + `/requirements/:id/responses`; web can _post_
     a requirement but I did not find a respond/view-responses surface — please confirm/finish.
     VISION §F also wants requirements out of the `/post` dropdown into a first-class "I want to
     buy" entry and a `/wanted` discovery route.
