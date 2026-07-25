# Architecture Decision Log

Format: one entry per decision. Never edit an accepted entry — supersede it with a new one.

---

## ADR-0001 — Modular monolith, not microservices (Phase 1)

**Status:** Accepted — 2026-07-25

**Context.** LocZ spans nine listing types, moderation, search, media and messaging. A service-per-module split at day one multiplies deployment, tracing and transaction cost before the domain boundaries are proven.

**Decision.** One NestJS application composed of independent modules. Modules communicate through injected services and, where the coupling is asynchronous, through BullMQ domain events (`listing.published`, `media.uploaded`, `moderation.decided`). No module imports another module's Prisma queries directly.

**Consequences.** Splitting later means replacing an injected service with an HTTP/queue client at an already-defined seam. Cost: discipline is enforced only by review and lint boundaries, not by the network.

---

## ADR-0002 — npm workspaces instead of pnpm

**Status:** Accepted — 2026-07-25

**Context.** The stack brief specifies a monorepo but not the package manager. The target development machine has npm 11 and no pnpm.

**Decision.** npm workspaces. Migration to pnpm is a `pnpm-workspace.yaml` plus lockfile regeneration if disk/install time becomes a problem.

**Consequences.** Slower installs and a flat `node_modules` with weaker phantom-dependency protection than pnpm. Accepted for zero setup friction.

---

## ADR-0003 — PostGIS `geography(Point,4326)` via raw SQL

**Status:** Accepted — 2026-07-25

**Context.** Prisma has no first-class PostGIS type. Every discovery query in LocZ is spatial.

**Decision.** The `geo` column is declared `Unsupported("geography(Point, 4326)")` in the Prisma schema so migrations own it, and all spatial reads/writes go through a single `GeoRepository` using parameterised `$queryRaw`. `geography` (not `geometry`) is used so distances are metres on the spheroid without projection juggling.

**Consequences.** Spatial queries are hand-written SQL and must be unit-tested against a real PostGIS instance. Confining them to one repository keeps the blast radius small and the injection surface parameterised.

---

## ADR-0004 — Unified listing table with per-type extension tables

**Status:** Accepted — 2026-07-25

**Context.** Nine listing types share ~25 fields (owner, location, moderation, lifecycle, counters) and diverge on ~10 each.

**Decision.** A `Listing` base table holds the shared contract; each type has a 1:1 extension table (`MarketplaceDetail`, `JobDetail`, …). Genuinely dynamic, admin-defined fields live in `ListingAttributeValue` keyed by `CategoryAttribute`.

**Consequences.** Reads that need type detail cost one join — cheap and indexed. Avoids both a 200-column table and nine parallel implementations of moderation, expiry, search and saving.

---

## ADR-0005 — Meilisearch is a derived index, never a source of truth

**Status:** Accepted — 2026-07-25

**Context.** Search indexes drift from the database, and drift that cannot be repaired becomes data loss.

**Decision.** Writes go to Postgres and enqueue a `search.index` job carrying only the listing id; the worker re-reads current state from Postgres before upserting. A full reindex rebuilds into a fresh index and swaps the alias. Meilisearch may be deleted at any time with no data loss.

**Consequences.** Search is eventually consistent (typically sub-second). Any read that must be immediately consistent — the poster's own "my listings" view — queries Postgres directly.

---

## ADR-0006 — Signed direct-to-storage uploads

**Status:** Accepted — 2026-07-25

**Context.** Proxying image bytes through the API burns request time and memory, and app-server disks are not durable storage.

**Decision.** The API validates intent (MIME, declared size, per-listing image cap, ownership) and returns a short-lived signed PUT URL. The client uploads directly to R2/MinIO and then confirms; a worker strips metadata, applies EXIF orientation, and derives thumb/card/full WebP renditions. No image binaries in PostgreSQL.

**Consequences.** A client can upload a file whose real content differs from its declared MIME, so the worker re-validates magic bytes and deletes on mismatch. Unconfirmed uploads are swept after 24 hours.

---

## ADR-0007 — Refresh-token rotation with family revocation

**Status:** Accepted — 2026-07-25

**Context.** Long-lived refresh tokens on mobile devices are the highest-value credential in the system.

**Decision.** Refresh tokens are opaque, stored only as hashes, bound to a `Device`, and rotated on every use. Presenting an already-rotated token is treated as theft: the entire token family is revoked and the user is notified.

**Consequences.** A client that loses a rotation response (network drop mid-refresh) is logged out of that device. Accepted — the alternative is an undetectable replay window.

---

## ADR-0008 — Moderation behind a provider interface, rules-based first

**Status:** Accepted — 2026-07-25

**Context.** Free posting invites spam; AI moderation is desirable but not a Phase 1 dependency.

**Decision.** `ModerationProvider.evaluate(listing) → { decision, score, reasons[] }`. Phase 1 ships `RuleBasedModerationProvider` (banned keywords, link/shortener heuristics, contact-detail policy, duplicate hashing, per-role rate limits). Decisions route to auto-approve, human review, or auto-reject, and every outcome is written to the moderation queue with its reasons.

**Consequences.** Swapping in an AI provider changes one binding and no call sites. Reason strings are part of the moderator UI contract and must stay stable.

---

## ADR-0009 — `geo` is derived by a database trigger, not by application code

**Status:** Accepted — 2026-07-25

**Context.** Latitude and longitude are ordinary Prisma columns; `geo` is a PostGIS geography Prisma cannot write. If the application had to populate both, any code path that forgot — a seed, an admin script, a bulk import — would produce a listing that exists but is invisible to every nearby search.

**Decision.** A `BEFORE INSERT OR UPDATE OF latitude, longitude` trigger derives `geo` on `listings`, `cities`, `localities`, `businesses`, `addresses` and `saved_locations`. Application code writes only the decimal columns.

**Consequences.** `geo` cannot drift from the coordinates by construction, and no writer needs PostGIS awareness. Cost: a trigger is invisible to someone reading only the Prisma schema, so it is called out in the schema comments and here.

---

## ADR-0010 — Idempotency keys on unsafe requests

**Status:** Accepted — 2026-07-26

**Context.** A seller on a patchy mobile connection taps "Publish", the response is lost in transit, and they tap again. Without protection they get two identical listings — and the second trips the duplicate-detection rule against their own account.

**Decision.** An `Idempotency-Key` header on POST/PATCH/PUT is honoured by a global interceptor backed by Redis, namespaced per user so no client can replay or observe another's response. The first request claims the key and caches its response for 24 hours; a repeat replays that response; a request arriving while the original is still running gets 409 rather than waiting. A failed attempt clears the key so the client may genuinely retry.

**Consequences.** Clients that want the guarantee must send the header — it is opt-in, not automatic, because keying every request would cache responses nobody will replay. Redis being unavailable degrades to no protection rather than to failure.

---

## ADR-0011 — A hand-written typed SDK instead of a generated client

**Status:** Accepted — 2026-07-26

**Context.** The brief asks for "a shared generated API client or typed SDK". Generating a client from the OpenAPI document produces thousands of lines of near-identical wrappers to review and re-review on every schema change.

**Decision.** `packages/api-client` is hand-written and thin, over shared types in `packages/shared-types`. The OpenAPI document is still exported and committed (`npm run openapi -w @locz/api`) so an API change is visible as a diff in review and external consumers can generate their own client.

**Consequences.** A new endpoint needs a small manual addition. Drift is caught by the shared types and by review of the committed `openapi.json`, not by regeneration. If a third-party consumer ever appears, the document is already there to generate from.

---

## ADR-0012 — Reports raise a counter; they never remove content by themselves

**Status:** Accepted — 2026-07-26

**Context.** Reporting is the platform's most valuable safety signal and also its easiest weapon: a competitor can bury a rival by mass-reporting. Auto-removing on a report would make abuse cheaper than honest competition.

**Decision.** A report increments a counter and is queued. At three independent open reports a listing is pulled from public view into `PENDING_REVIEW` — hidden, not deleted. Removal is always an explicit moderator action. Reporters are themselves rate limited (10/hour), and resolving one report closes every open report against the same target and notifies each reporter of the outcome.

**Consequences.** A genuinely abusive listing stays visible slightly longer than an auto-remove policy would allow. In exchange, mass-reporting cannot be used as a takedown tool, and reporters learn their report mattered — which is what keeps them reporting.
