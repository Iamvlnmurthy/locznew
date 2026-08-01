# LocZ — vision alignment review

Analysis only. No application code was changed.

Method: direct reading of the Prisma schema, every API controller, the web and admin route
trees, the Flutter feature tree, the feed service and the search path — plus live checks
against the deployed API at `api.locz.in`. Where a claim below could be verified against
production it was, and the result is quoted.

Companion review read and cross-checked: `loczbusinessdata/docs/LOCZ-VISION-ALIGNMENT.md`
(dated 2026-08-01). Its structural findings hold up. Four of its scores are now stale
because the features landed after it was written; those are corrected below and marked.

---

## A. Executive summary

**The codebase is an unusually well-built local classifieds platform. The vision describes a
two-sided local demand-and-supply network. Roughly 60% of the distance is covered, and the
missing 40% is concentrated almost entirely in one place: the buyer-demand loop.**

The foundation is genuinely strong and should not be rebuilt. Location modelling, typed
listings, moderation, child safety, audit, RBAC, media, i18n and search discipline are at a
standard most products never reach. Payments are correctly absent. Ratings are correctly
deferred. The typed-listing architecture (`Listing` + per-type detail tables) is exactly what
§12 asks for and avoids the generic-listing trap §E warns against.

What is missing is not polish. It is the half of the marketplace the vision names as the
differentiator:

> Buyers post what they need. Sellers post what they have. LocZ connects them nearby.

The second sentence works. The first is a data model with no product around it. `BUYER_REQUIREMENT`
exists as a listing type with five columns and no responses, no matching, no notifications, no
status, and no way for a seller to reply except by opening a normal chat. **The connecting
verb in the product principle — "connects them" — is the part that does not exist.**

Three other gaps matter structurally rather than cosmetically:

1. **No seller or business typing.** A home baker, a retail store and someone selling a used
   phone are the same kind of account. §2.3 and §13 both depend on this, and so does the
   business-data engine's import.
2. **No dual-intent entry point.** "I Want to Buy / I Want to Sell" does not exist in web or
   mobile. Buyer requirements are reachable only through the listing-type dropdown on `/post`
   — precisely the anti-pattern §4 names.
3. **No availability or fulfilment model.** `ListingStatus` describes a listing's lifecycle,
   not whether the thing is in stock, made to order, or collectable today.

**One thing worth stating plainly:** the platform is live, has a real user path end to end, and
every foundational decision I inspected was made carefully. The gap is scope, not quality.

---

## B. Current application map

### Web routes (23)
```
/ /location /search /post /post/[id]/edit /register /signin /dashboard
/ad/[slug] /b/[slug] /c/[slug] /in/[city]
/business /business/new /business/manage/[id]
/chats /chats/[id] /notifications /report
/(static)/about /(static)/get-app /(static)/help /(static)/privacy /(static)/safety /(static)/terms
```

### Mobile screens (10)
`home` · `search` · `listing_detail` · `post_ad` · `account` · `chat` (feature) ·
`notifications` · `city_picker` · `report_listing` · `sign_in` / `register`

No business, offer, buyer-requirement or seller-profile screen exists.

### API modules (18)
`admin` `audit` `auth` `businesses` `categories` `common` `config` `conversations` `feed`
`geo` `health` `lifecycle` `listings` `media` `moderation` `notifications` `prisma` `queue`
`rbac` `redis` `reports` `search` `search-subscriptions` `users`

~110 routes. Full inventory in the route dump appended to this review's source commit.

### Admin console (11 pages)
`/` `/users` `/businesses` `/listings` `/moderation` `/reports` `/safety` `/safety/[id]`
`/categories` `/audit` `/system`

### Database — 60 models
Core: `User` `Role` `UserRole` `Device` `Session` `Business` `BusinessStaff` `Listing` +
7 typed detail tables + `CategoryAttribute` / `ListingAttributeValue` · `ListingMedia`
Geo: `Country` `State` `District` `City` `Locality` `Pincode` `Address` `SavedLocation` `ServiceArea`
Engagement: `Conversation` `Message` `Block` `SavedListing` `SavedBusiness` `RecentlyViewed`
`SearchSubscription` `Notification` `NotificationPreference`
Safety: `Report` `ModerationAction` `ModeratorNote` `BannedKeyword` `BlockedImageHash`
`MediaSafetyCase` `MediaSafetyAccessLog` `UserSuspension` `AuditLog`
Inactive by design: `Plan` `Subscription` `FeaturedPlacement` `Banner`

### Search
One Meilisearch index (`listings`), derived-only. Attribute and typed-column filters route to
PostgreSQL because they are not in the indexed document. **Businesses are not indexed at all.**

### Background jobs (11)
`index-listing` `remove-listing` `reindex-all` `send-notification` `expire-listings`
`warn-expiring` `sweep-orphan-media` `sweep-sessions` `trim-recently-viewed`
`lift-expired-suspensions` `match-saved-searches`

---

## C. Vision-to-code mapping

| § | Requirement | Classification | Evidence |
|---|---|---|---|
| 2.1 | Offline business discovery | **Partially implemented** | `Business` + `/b/[slug]` exist; businesses are not searchable — the index holds listings only |
| 2.2 | No payments, no commission | **Fully implemented** | No wallet, escrow, checkout or commission anywhere. `Plan`/`Subscription`/`FeaturedPlacement` schema-only |
| 2.3 | Home businesses given identity | **Missing** | No `businessType` field anywhere in 60 models |
| 2.4 | Offline product search | **Partially implemented** | 26 category attributes + typed-column filters now live; store inventory still not modelled as products |
| 3.1 | Seller-to-buyer | **Largely implemented** | 9 listing types, all routed, all posting |
| 3.2 | Buyer-to-seller | **Implemented incorrectly** | Exists as a listing type; behaves as supply, not demand |
| 4 | Dual-intent home screen | **Missing** | No buy/sell split in web or mobile |
| 5 | Home feed structure | **Partially implemented** | 8 sections including `requirements` ("People looking for") — better than assumed; no buy/sell intent, no stores or home businesses |
| 6 | Location-first | **Fully implemented** | Country→…→Pincode, PostGIS `geography(Point,4326)`, GiST, trigger-maintained, 19,238 pincodes, 640 cities |
| 7 | Universal search with type grouping | **Partially implemented** | Strong single-type search; **no cross-type grouping tabs**; businesses absent |
| 8 | Business storefronts | **Partially implemented** | Hours, holidays, service areas, staff, verification, public page. No product catalogue attached |
| 9 | Product and inventory discovery | **Missing** | No stock state, no bulk/CSV, no fast-create, no duplicate |
| 10 | Buyer requirements as a major section | **Implemented but hidden in UX** | Reachable only via the `/post` listing-type dropdown — the exact anti-pattern §4 forbids |
| 11 | Seller matching and responses | **Missing** | No response model, no matcher, no notification type, no requirement chat context |
| 12 | Typed listing types | **Fully implemented** | ADR-0004, 7 detail tables, per-type validation |
| 13 | Seller types | **Missing** | No `sellerType`; interface cannot adapt |
| 14 | Availability and fulfilment | **Missing** | `ListingStatus` is lifecycle; no stock/fulfilment states |
| 15 | Direct contact, deal outside | **Largely implemented** | `ContactPreference`, `showPhonePublicly` default false, chat, WhatsApp share verified not to leak the number |
| 16 | Chat safety | **Partially implemented** | Block, report, moderation present; **no contextual fraud cautions in chat** |
| 17 | Offers and deal feed | **Partially implemented** | `OfferDetail` with validity and redemption; feed section exists; no `/offers` route |
| 18 | Local feed with typed cards | **Partially implemented** | Sections are typed; individual cards do not visually distinguish WANTED from FOR SALE |
| 19 | Trust and reputation | **Partially implemented** ⬆ | *Corrected:* seller profile with response rate and median reply time shipped and deployed; both withheld below 5 conversations |
| 20 | Moderation and safety | **Fully implemented** | 197 banned keywords, image hashing, legal hold with access audit, suspensions, appeals, child-safety officer role |
| 21 | User roles | **Largely implemented** | RBAC with permissions; a user is both buyer and seller by default — §21 respected |
| 22 | Mobile experience | **Partially implemented** | 10 screens; no bottom-nav Post split, no business/offer/requirement screens |
| 23 | Web SEO surfaces | **Largely implemented** | `sitemap.ts`, `robots.ts`, city/category/business/listing routes, structured metadata |
| 24 | Admin console | **Partially implemented** | 11 pages; no requirements, no verification queue, no demand analytics |
| 25 | Analytics | **Missing** | Counters exist on entities; **zero-result searches are not captured at all** — the vision names these the most valuable signal |
| 26 | Future capability headroom | **Intentionally deferred** | Schema-ready and inactive, correctly |

**Four scores corrected upward** from the 2026-08-01 companion review, all because the work
landed after it was written: §19 (seller profile), §2.4 and §7 (category attributes and
filters), §5 (the feed's `requirements` section was already there and was under-credited).

---

## D. User journey review

| # | Journey | Verdict |
|---|---|---|
| 1 | Buyer searches for a nearby product | **Works.** Location → search → filters → listing → chat. Typo tolerance live. Distance available. |
| 2 | Buyer cannot find it and posts a requirement | **Broken as a journey.** A zero-result search offers no route to "post what you need". The user must find `/post`, then discover `BUYER_REQUIREMENT` inside a dropdown. Nothing connects the failure to the remedy. |
| 3 | Seller receives a matching requirement | **Does not exist.** No matcher, no notification type, no surface. |
| 4 | Seller responds to the buyer | **Does not exist.** No `RequirementResponse` model. The only path is a generic chat with no requirement context. |
| 5 | Buyer and seller chat | **Works**, for listing, business and job contexts. `ConversationContext` has no requirement value, so a requirement conversation cannot be labelled as one. |
| 6 | User creates a business | **Works.** `/business/new`, staff, hours, service areas, verification request. |
| 7 | Business adds products | **Does not exist.** A listing may carry `businessId`, but there is no catalogue concept, no bulk add, no stock. |
| 8 | Customer discovers the business through a product search | **Broken.** Businesses are not indexed. Searching "rat cage" cannot surface a hardware shop — only a listing someone posted. This is the §2.1/§2.4 core scenario and it does not work. |
| 9 | Business posts an offer | **Works** as a listing type; no dedicated composer or offers surface. |
| 10 | User discovers nearby offers | **Partially.** Feed section exists; no `/offers` route or filter surface. |
| 11 | Individual sells a used item | **Works** end to end. The strongest journey in the product. |
| 12 | Home business creates a storefront | **Indistinguishable from a retail store.** No type, no badge, no adapted form. |
| 13 | User reports fraud | **Works.** Report → queue → moderator → resolution → audit. |
| 14 | Moderator resolves the report | **Works**, and is the best-built journey in the codebase. |

**Journeys 2, 3, 4, 7 and 8 are the product.** Four do not exist and one is broken.

---

## E. Architecture gaps

1. **Buyer requirement modelled as supply, not demand.** It is a `Listing` — same table, same
   status machine, same expiry, same moderation, same feed treatment. Demand has different
   semantics: it is fulfilled rather than sold, it accumulates responses, it closes when the
   buyer is satisfied. None of that is expressible today.

2. **No response model.** `RequirementResponse` does not exist. Without it there is no way to
   record *Available* / *Can arrange* / *Made to order*, no response count, no anti-spam
   surface, and no way to measure the fulfilment rate §25 asks for.

3. **`ConversationContext` cannot represent a requirement conversation.** A three-value enum
   blocks §11's "responses should create or open a chat".

4. **Business is not searchable.** The index contains listings only. §2.1's central promise —
   search a product, find the shop — is architecturally unreachable without indexing businesses
   or their inventory.

5. **No product/inventory entity.** A listing is not a catalogue item. There is no way for a
   store to say "we stock this" without creating a full listing per SKU, which no kirana store
   will do.

6. **`Business.ownerId` is NOT NULL, and there is no pincode relation or claim concept.** This
   blocks the 4M-record directory import outright, and is the same field the vision needs for
   §2.3. Confirmed directly in the schema.

7. **No provenance fields.** No `source`, `licence`, `attribution` or `confidence` on
   `Business`. Importing ODbL and CDLA data without these would breach the licences.

8. **Availability conflated with lifecycle.** `ListingStatus` mixes moderation state
   (`PENDING_REVIEW`) with commercial state (`SOLD`). Adding `OUT_OF_STOCK` to that enum would
   deepen the conflation rather than fix it.

**Not a gap, and worth defending:** location logic is *not* duplicated (all spatial I/O goes
through `GeoRepository`), listing filters are *not* duplicated (one `whereFor`), and
auditability is comprehensive. Three of the failure modes §E anticipates were already avoided.

---

## F. UX gaps

- **The buyer-requirement flow is hidden** in a dropdown — named explicitly in §4 as the thing
  not to do.
- **Buy and sell are not equal.** The home page and `/post` are seller-shaped throughout.
- **A zero-result search is a dead end.** It should be the single best moment to offer "post
  what you need"; it currently offers nothing.
- **Feed cards do not carry their type visually.** A WANTED card and a FOR SALE card look alike,
  which §18 forbids specifically.
- **No home-business identity.** Nothing distinguishes a home baker from a shop.
- **No contextual safety messaging in chat.** Static safety pages exist; §16 asks for cautions
  at the moment of risk.
- **Mobile has no Post intent split** and no business, offer or requirement screens.
- **No business catalogue management**, so a store with 200 products has no realistic path in.

---

## G. Prioritised recommendations

### Priority 0 — critical foundation
1. `RequirementResponse` model + `ConversationContext.REQUIREMENT_ENQUIRY`.
2. Requirement lifecycle: `isActive`, `isFulfilled`, `responseCount`, `searchRadiusKm`,
   `deliveryPreference` on `BuyerRequirementDetail`.
3. `Business.businessType` and `User.sellerType` enums (migration, values as data).
4. Make `Business.ownerId` nullable, add `pincodeCode`, `claimStatus`, and provenance
   (`sourceName`, `licenceName`, `attributionText`, `confidenceScore`).

### Priority 1 — core vision
5. **Requirement → seller matching.** The substrate already exists and is proven: the
   saved-search matcher shipped this week runs on its own queue, asks the search path whether
   a listing matches, and delivers a notification. Matching a *requirement* to *sellers* is the
   same machinery pointed the other way. This is the cheapest credible path to §11 and it is
   already load-bearing in production.
6. Dual-intent entry: "I Want to Buy" / "I Want to Sell" on web home and mobile Post.
7. `/wanted` route and mobile requirement screens.
8. Typed feed cards — WANTED / FOR SALE / OFFER visually distinct.
9. Zero-result search capture, with "post what you need" offered at that exact moment.

### Priority 2 — marketplace usability
10. Business product catalogue with fast-create and CSV import.
11. Index businesses (and catalogue items) so a product search finds the shop.
12. Availability and fulfilment as their own fields, separate from `ListingStatus`.
13. `/offers` route and offer composer.
14. Home Business badge across cards, storefronts and search.
15. Contextual chat safety cautions.
16. Cross-type search grouping tabs.

### Priority 3 — growth
17. Admin: requirements, verification queue, supply-demand gap reporting.
18. Directory import of the 4M-business dataset behind the claim funnel.
19. Seller-facing analytics.

### Deferred — unchanged
Payments, boosts, featured placement, delivery ownership, ratings until the §19 preconditions
exist, price intelligence and locality insights until data volume supports them.

---

## H. Implementation plan

**Phase 1 — Make demand a first-class citizen** *(the differentiator)*
Objective: a buyer posts a need and a relevant seller hears about it.
Backend: `RequirementResponse` service, matcher on the existing queue pattern, new
`NotificationType.REQUIREMENT_MATCH` and `REQUIREMENT_RESPONSE`. DB: response table,
requirement lifecycle columns, conversation context value. Web: `/wanted`, requirement detail,
respond action. Mobile: requirement list, detail, respond. Admin: requirements page.
Search: none needed — matching reuses `whereFor`.
Risks: notification volume; spam responses. Mitigation: response limits, category relevance,
duplicate prevention — all named in §11.
Acceptance: post a requirement in Madhapur; a Madhapur seller in that category is notified;
responding opens a chat carrying requirement context; the buyer can close it as fulfilled.

**Phase 2 — Dual intent and typed surfaces**
Objective: the product reads as two-sided.
Web/mobile only: buy/sell split, typed cards, zero-result capture and its call to action,
`/offers`. Backend: a small analytics table for zero-result searches.
Acceptance: a zero-result search offers requirement posting and the search is recorded.

**Phase 3 — Seller typing and home businesses**
Objective: a home baker is not a classified seller.
DB: `businessType`, `sellerType`. Web/mobile: badges, adapted post forms. Search: type facet.
Migration risk: low — additive, defaulted.

**Phase 4 — Business catalogue and inventory**
Objective: a store can be found by what it stocks.
DB: catalogue item entity keyed to business. Backend: fast-create, CSV import, availability.
Search: index businesses and catalogue items — the largest search change in the plan.
Risk: index size and relevance mixing across entity types. Mitigation: separate index or a
type facet, decided by measurement rather than assumption.

**Phase 5 — Directory import**
Objective: the feed is not empty on day one in a new pincode.
Requires Phase 3's `businessType` and P0's nullable owner, claim status and provenance.
Risk: 4M unowned records diluting search; attribution obligations; a dead call button on a
`LOCATABLE` record. Mitigations already designed in the engine: tiering, shared-number
suppression, `claim_status`.

---

## I. File-level change plan

Only files verified to exist are named.

**Modify**
- `apps/api/prisma/schema.prisma` — response model, requirement lifecycle, conversation context, business/seller type, business owner nullability, pincode relation, provenance
- `apps/api/src/listings/dto/listing.dto.ts` — requirement fields
- `apps/api/src/listings/listings.service.ts` — requirement create/close paths
- `apps/api/src/conversations/conversations.service.ts` — requirement context
- `apps/api/src/notifications/*` — new notification types
- `apps/api/src/feed/feed.service.ts` — stores, home businesses, typed cards
- `apps/api/src/search/search.service.ts` + `apps/api/src/listings/search-query.service.ts` — business indexing, type grouping
- `apps/api/src/businesses/businesses.service.ts` — type, claim, catalogue
- `apps/web/src/app/page.tsx` — dual intent
- `apps/web/src/app/post/page.tsx`, `post-form.tsx`, `listing-type-fields.tsx` — lift requirements out of the dropdown
- `apps/web/src/app/search/page.tsx` — zero-result call to action, grouping tabs
- `apps/admin/src/app/(console)/*` — requirements, verification queue
- `apps/mobile/lib/features/{home,post,search}` — intent split, requirement screens

**Create**
- `apps/api/src/requirements/` — module, service, controller, DTOs, matcher processor
- `apps/api/prisma/migrations/<timestamp>_buyer_requirement_responses/`
- `apps/api/prisma/migrations/<timestamp>_business_and_seller_types/`
- `apps/api/prisma/migrations/<timestamp>_directory_businesses/`
- `apps/web/src/app/wanted/`, `apps/web/src/app/offers/`
- `apps/mobile/lib/features/requirements/`, `.../business/`
- Tests beside each, following the existing `apps/api/test/*.spec.ts` convention

**Refactor**
- Availability out of `ListingStatus` into its own field — the one genuinely risky migration

**Deprecate**
- Nothing. No existing feature needs removing for any of this.

---

## J. Risks

| Risk | Assessment |
|---|---|
| **Data migration** | P0 changes are additive and defaulted — low. Splitting availability from `ListingStatus` is the exception and needs a backfill plus a compatibility window. |
| **Search index** | Highest technical risk. Adding businesses and catalogue items changes relevance for existing queries. Meilisearch is derived-only (ADR-0005), so a rebuild is always safe — but ranking regressions would be silent. Needs before/after relevance checks, not just a green rebuild. |
| **Backward compatibility** | APK 0.7.0+7 is in testers' hands. New enum values in API responses can break strict Flutter deserialisation. New values must be additive and the app must tolerate unknown ones. |
| **Security** | Requirement responses are a new user-to-user channel and therefore a new spam and scam surface. It needs the rate limiting, blocking and reporting the listing path already has, from day one rather than after. |
| **Privacy** | A requirement reveals what someone wants, when, and roughly where. Radius rather than exact location, and no contact details until the buyer engages. |
| **Moderation** | Requirements and responses need to enter the same queue as listings. Shipping them outside moderation would be the single worst mistake available here. |
| **Performance** | Matching every new listing against active requirements is the mirror of the saved-search matcher, which is already queued and city-indexed. The pattern holds; the volume needs watching. |
| **SEO** | New routes are additive. Directory businesses could generate millions of thin pages — they must not be indexable until claimed or substantially complete. |
| **Notification fatigue** | The largest product risk in Phase 1. Too many requirement alerts and sellers disable notifications entirely, taking listing and chat alerts with them. Per-type preferences already exist and must be used. |
| **Directory import** | 4M unowned records could swamp genuine listings in search and make the platform feel like a scraped directory. Tiering, claim status and ranking separation are prerequisites, not follow-ups. |

---

## Closing judgement

Nothing here argues for rebuilding. The foundation is sound and in several areas — moderation,
child safety, location, audit, filter discipline — it is better than the vision demands.

The honest summary is narrower than a percentage suggests: **LocZ has built the supply side of
a two-sided marketplace, and the demand side is a database table.** The single highest-value
change is Phase 1, and the machinery for it already exists and is already running in
production as the saved-search matcher. Pointing that mechanism the other way is a smaller job
than it looks, and it is the difference between a good local classifieds site and the product
the vision describes.
