# Codex and Claude Code work split

This is the active ownership agreement for the flagship-quality pass. Before each task,
both agents must inspect `git log -5 --oneline` and `git status --short`. Existing dirty
files belong to the other agent until proven otherwise.

## Non-overlapping ownership

### Codex — product experience

Codex owns:

- `apps/web/**`
- presentation code under `apps/mobile/lib/**/presentation/**`
- `apps/mobile/lib/core/theme/**` and mobile accessibility tests
- browser interaction checks in `scripts/acceptance-browser.mjs` and
  `scripts/acceptance-localized-browser.mjs`
- visual QA, responsive behavior, localization, accessibility and product copy

Current Codex queue:

1. **Done:** Fix singular/plural search copy in every locale and every result-count surface.
2. **Done:** Redesign sparse search states: zero, one and two results must use the desktop canvas
   intentionally instead of leaving a large accidental void.
3. **Done for search:** Make result cards, safety guidance, filters and featured state form one
   coherent hierarchy at desktop, tablet and mobile widths.
4. **Done:** Audit every public and signed-in web route at 390, 768, 1024 and 1440 pixels.
5. **Done for web:** Exercise loading, designed 404, empty, one-item, many-item and
   long-translation states. A localized global loading skeleton now covers slow transitions.
6. **Done for defects found so far:** Add durable browser assertions for every defect found.
   This now includes sparse search, save/unsave sequencing, real-document navigation and
   responsive route/state coverage.
7. **Done:** Diagnose the business-creation browser timeout. The product flow and direct API
   create/delete both pass; the gate now allows the established 60-second cold-action budget
   and reports a returned server error directly instead of timing out ambiguously.
8. **Done:** Isolate and verify the previously uncovered late-stage interaction boundary.
   `npm run acceptance:business-safety` now proves 29 owner, admin, safety, accessibility,
   persistence and cleanup behaviors without rerunning already-green sections 0–6.

Codex does not edit API search behavior, Prisma, Meilisearch configuration or backend
acceptance expectations.

### Claude Code — correctness and platform behavior

Claude Code owns:

- `apps/api/**`
- `apps/api/prisma/**`
- `packages/api-client/**` and shared API contracts when required
- `scripts/acceptance.mjs`, `scripts/acceptance-filters.mjs`,
  `scripts/acceptance-security.mjs`, `scripts/acceptance-jobs.mjs` and
  `scripts/acceptance-performance.mjs`
- search relevance, database/Meilisearch parity, authorization, lifecycle and data
  integrity
- production infrastructure and operational correctness

Current Claude Code queue:

1. **Done:** Reproduce why `q=car` returns an iPhone: Meilisearch prefix-matched `car`
   against “carefully” in the description.
2. **Implemented; gate evidence pending:** Fix relevance so an explicit keyword cannot
   return a semantically unrelated listing. The live UI now returns zero results for `car`.
3. Make Meilisearch and database fallback return equivalent ordering and filtering.
4. **In progress:** Add behavioral tests covering exact terms, prefixes, typos, category
   terms, irrelevant terms, singular result counts and zero-result honesty. New relevance
   and keyword unit tests are present but must pass Claude's full gate.
5. Verify explicit sorting never gets overridden by featured placement.
6. Audit every interactive API path used by save/undo, enquiry, filters, moderation,
   media upload and business management.
7. Finish production-provider boundaries without pretending unavailable credentials or
   compliance approval exist.

Claude Code does not edit web CSS, page composition, mobile presentation widgets or
localized product copy.

## Shared-file rules

- `package.json` and `package-lock.json`: Codex owns them during the UX pass. Claude must
  request a handoff before changing dependencies.
- `docs/openapi.json`: Claude owns generation; Codex only consumes it.
- `apps/web/src/i18n/messages/*.json`: Codex owns user-facing copy. Claude may propose a
  new API error key but must not edit these files directly.
- If an API response contract must change, Claude records the exact old/new shape here
  before editing shared consumers.
- Neither agent reformats or reverts files outside its ownership.

## Integration checkpoints

1. Claude publishes the search-correctness test cases and API response evidence.
2. Codex tests the same queries in the real UI, including `car`, nonsense text and
   one-result searches.
3. Both gates must pass independently:
   - Claude: API unit tests plus filter/search/security acceptance.
   - Codex: lint, i18n, hardcoded-copy scan, responsive browser and accessibility checks.
4. The final release gate runs only after both tracks are green on the same commit.

Current search integration evidence:

- Claude's focused relevance/query suites pass 26/26.
- The live filter/search API gate passes 62/62, including explicit price ordering,
  database fallback keyword handling, irrelevant-fragment rejection and final-page totals.
- `npm run acceptance:search-browser` is the focused response-to-UI gate for `car`,
  nonsense text and a deterministic singular result. Its first two runs exposed a fixture
  bug: timestamp/hyphen and numeric-only UUID probes are not stable searchable words.
  A later run proved the replacement long token was indexed within 26 ms but still did not
  reach the rendered result. Fixture markers are now short, letter-prefixed alphanumeric
  words, and the gate waits until the search API can see the exact fixture before navigating.
  The next run stopped before search because the fixture factory had consumed the shared
  moderator's real 30-post daily limit. Fixture ownership now uses the supplied buyer token;
  the administrator token is limited to approval. The following run proved singular rendering
  and the honest `car` zero state; its “nonsense” phrase used common searchable prefixes and
  was therefore not a valid zero-result fixture. That probe is now one random alphanumeric
  word and must have an API total of zero before its UI is checked. The later run passed that
  final state, as recorded below.

Latest same-state evidence:

- `npm run acceptance:search-browser` now passes 6/6: deterministic singular result and
  card, `car` API/UI zero state, random-token API/UI zero state, and no browser or server
  runtime errors.
- Release evidence is in
  `artifacts/release-gate-2026-07-26T15-53-16.155Z.json`. The candidate is not releasable:
  the worktree is intentionally dirty, production TLS/environment/Docker prerequisites are
  absent, and stack-only gates were skipped.
- Claude moved `npm ci` and the production audit into a detached temporary Git worktree.
  Diagnostic evidence in `artifacts/release-gate-2026-07-26T16-09-25.199Z.json` proves the
  active checkout remained intact: all three services stayed healthy and workspace
  typecheck/tests/builds passed while the candidate install ran.
- The isolated diagnostic against old commit `c7c4b08` failed honestly: its manifest and
  lockfile disagreed (`axe-core` and `@aws-sdk/client-rekognition` were missing from the
  committed lock), and its committed dependency tree had high advisories.
- Claude has since cut candidate `0e63386` with the synchronized project state. Existing
  JSON evidence predates that commit, so the new candidate still requires an isolated
  install/audit run before it can inherit any release claim.
- The isolated worktree is removed correctly, but its empty `locz-release-candidate-*`
  parent directory remains. Claude should remove the verified temp parent after
  `git worktree remove` unless `--keep-candidate` is set.
- Recovery checks prove those downstream failures were environmental rather than source
  regressions: all seven TypeScript workspaces pass, all 25 API suites pass with 276/276
  tests, and optimized API, web and admin production builds complete successfully.

## Definition of complete

“Complete” means all of the following, not merely a successful build:

- Correct results for realistic user intent.
- Correct singular/plural and localized copy.
- Deliberate layouts for empty, sparse and dense data.
- Keyboard, screen-reader, contrast and mobile-width accessibility.
- Durable automated checks for behavior and presentation.
- No fixture residue or browser/runtime errors.
- Production blockers are named accurately and never replaced with fabricated secrets,
  provider responses or compliance approvals.

## Task to paste into Claude Code

> Read `docs/CODEX_CLAUDE_WORK_SPLIT.md` and follow the Claude Code ownership boundary.
> Start with search correctness. Reproduce `q=car` returning the iPhone, show the exact
> field or token that matched, fix both Meilisearch and database fallback semantics, and
> add durable tests proving irrelevant listings do not appear. Do not edit `apps/web/**`,
> mobile presentation files, localized copy, `package.json` or `package-lock.json`.
> Before every edit, re-check Git because Codex is working concurrently.

## Verified checkpoint — 2026-07-26

- Web TypeScript, ESLint, i18n coverage (1,278 English keys), placeholder parity,
  hardcoded-copy scan and the Next.js production build pass.
- Desktop one-result search renders correct singular copy and a 760 px editorial card
  without horizontal overflow.
- Mobile one-result search renders at 354 px without overflow; the filter drawer locks the
  page, exposes an honest “Apply filters” action and closes with Escape.
- Search sort-label contrast is 7.16:1.
- Listing contact now uses the real `contactSeller` and `phoneHidden` translation keys;
  the logged-in listing/lightbox page has no automated WCAG violations.
- The original responsive route pass is 89/89 across 22 real public/authenticated routes
  and four required widths, with no overflow, framework overlay or runtime error.
- The expanded state pass confirmed 132 layout checks for zero/one/many search, designed
  404, Telugu and Hindi. Its only final log was the deliberately requested 404; that
  expected log is now isolated and a focused follow-up proves the next route remains clean.
- Focused save/unsave verification passes DOM and API durability in both directions. The
  broad gate race was a test clicking a deliberately disabled button before its first
  Server Action settled; the permanent gate now waits for the enabled state.
- A localized, reduced-motion-aware global loading skeleton is present, and the production
  web build passes with it.
- Mobile listing cards now expose localized Featured text and one concise semantic action
  containing title, price, place, distance and sold/featured state.
- Mobile cards no longer overflow when Telugu text is rendered at the supported 1.4× scale:
  metadata shares constrained width, home rails grow with text, and search/saved grids use
  fewer, taller cards for large text.
- Flutter analysis reports no issues and all 18 mobile tests pass, including the new
  narrow-card, fixed-rail and large-text grid widget checks.
- `npm run acceptance:business-safety` is now a focused, reversible late-stage browser
  gate. It skips already-green sections 0–6 while reusing the same interaction source and
  cleanup path as the broad gate.
- The focused owner/admin/safety journey passes 29/29: business creation, draft recovery,
  field validation, dashboard discovery, profile persistence, verification request and
  approval, owner notification, staff grant/revoke and non-owner rejection all reach the
  API with the expected state.
- The restricted safety journey also passes through the real admin UI and database:
  wildcard admins cannot see safety navigation, safety-only officers cannot see ordinary
  moderation, evidence is concealed behind an audited justification, closure persists,
  media remains under `LEGAL_HOLD`, seven named audit records exist, fixtures are removed,
  and the browser reports no runtime errors. Queue, open-case and business-onboarding
  states pass automated WCAG A/AA checks; the mobile manager has no horizontal overflow.
  Cleanup is also asserted through the owner API, so a soft-deleted audit tombstone cannot
  masquerade as an active business fixture.
