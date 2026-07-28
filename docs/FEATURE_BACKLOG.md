# Feature backlog

Everything agreed for the classifieds feature set, **excluding mobile-number OTP and paid
promotions**, which are deliberately out of scope.

Ordered by what breaks the product if missing, not by what is interesting to build. Ownership
follows `CODEX_CLAUDE_WORK_SPLIT.md`: Codex owns UI, web and mobile; Claude owns API, data,
jobs, security and verification.

Status is one of **missing**, **scaffolded** (schema or endpoint exists, nothing uses it),
**partial**, or **done**. Anything claimed done has been exercised against the deployed stack,
not just unit-tested — two outages this month were invisible to green local suites.

---

## Tier 1 — the product reads as broken without these

| # | Feature | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | **Edit a listing** | scaffolded | Codex | `PATCH /listings/:id` has existed since the start and nothing calls it. No edit route on web, no edit action on mobile. A wrong price today means delete and repost, losing views, age and conversations. |
| 2 | **Delete on mobile** | scaffolded | Codex | `listing_repository.dart` can delete; the action menu in `account_screen.dart` never offers it. Web has it. App users cannot remove their own ad. |
| 3 | **Photo management** — reorder, cover, remove one | scaffolded | Codex + Claude | `ListingMedia.sortOrder` exists and is indexed. Needs a reorder endpoint, then UI. |
| 4 | **Listing draft recovery** | missing | Codex | A half-written post lost on navigation is the most common reason a first listing never happens. |

## Tier 2 — the reasons people come back

| # | Feature | Status | Owner | Notes |
|---|---|---|---|---|
| 5 | **Saved searches with alerts** | scaffolded | Claude + Codex | `SearchSubscription` is modelled, indexed for a by-city matcher, and has *zero* code. The single strongest retention feature in this category. Needs service, CRUD, a matcher job on publish, and notification delivery. |
| 6 | **Masked calling** | missing | Claude | **Blocked on a telephony provider** (Exotel, Knowlarity, Twilio). Indian users call rather than chat, and exposing a personal number is the top reason sellers leave. Serves the standing rule that contact details stay private unless the owner chooses otherwise. |
| 7 | **Seller profile and history** | partial | Claude + Codex | Member since, listings posted, response rate. `Conversation`/`Message` already carry what response rate needs. |
| 8 | **Price suggestion** | missing | Claude | Median of comparable local listings by category and attributes. Only honest once (9) gives us attributes to compare on. |
| 9 | **Ratings and reviews** | missing | Claude + Codex | New model. Needs abuse thinking before it ships: reviews are the most gamed surface on every marketplace, and a rating nobody can appeal is worse than none. |

## Tier 3 — category depth, where the incumbents actually win

| # | Feature | Status | Owner | Notes |
|---|---|---|---|---|
| 10 | **Structured attributes per category** | scaffolded | Claude + Codex | `CategoryAttribute` and `ListingAttributeValue` are fully modelled with `isFilterable`/`isSearchable` flags meant for facets. Only `categories.service.ts` reads them; posting and filtering ignore them. This is what makes filters useful, and useless filters are why generic classifieds lose to specialists. Prerequisite for 8, 11 and 12. |
| 11 | **Vehicle and property taxonomies** | missing | Claude | Brand/model/year, BHK/carpet area/furnishing/floor. Data seeding on top of (10). |
| 12 | **Locality intelligence** | missing | Claude | Average asking rents and prices per locality, derived from our own listings. Honest only above a minimum sample size — a "average rent" computed from two listings is a fabrication. |
| 13 | **Verified-owner badge** | missing | Claude + Codex | NoBroker's whole brand in one badge. Needs a verification process behind it, not just a flag, or it is a lie with a tick next to it. |
| 14 | **Make an offer** | missing | Claude + Codex | Buyer proposes a price against a listing; seller accepts, declines or counters. |
| 15 | **Sold archive** | partial | Claude | `sold` already transitions status. Needs the sold price retained for (8) and a seller-visible history. |

## Explicitly out of scope

- **Mobile-number OTP.** Excluded by instruction. Phone numbers therefore stay unverified;
  every feature above must be designed on the assumption that a number proves nothing.
- **Paid promotions, featured placement, bumps, subscriptions.** Excluded by instruction and
  by the standing Phase 1 rule that no payment path is activated. `Plan`, `Subscription` and
  `FeaturedPlacement` remain schema-only.

## Not being copied on purpose

Quikr's expansion into doorstep services diluted its core badly, and 99acres-style builder
inventory needs a sales team more than it needs software. The edge here is hyperlocal and
honest, which is better served by depth in a few categories than breadth across many.

## Dependencies worth stating early

- (8) price suggestion and (12) locality intelligence are both **statistical claims shown to
  users**. Each needs a minimum sample before it displays anything, and must say what it is
  based on. A confident number derived from three listings is worse than no number.
- (6) masked calling cannot start without a provider account.
- (9) reviews and (13) verified-owner both change what users believe about strangers. Neither
  should ship without an appeal path.
