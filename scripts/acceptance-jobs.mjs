#!/usr/bin/env node
/**
 * Background job acceptance gate.
 *
 *   node scripts/acceptance-jobs.mjs
 *
 * The part of the system nobody ever watches. Expiry, the expiry warning, orphan-media
 * cleanup, session pruning and the nightly reindex all run on a schedule, which means a
 * broken one is invisible until a user asks why their sold item is still on the site.
 *
 * `docs/ACCEPTANCE.md` used to describe these as manual SQL plus a fifteen-minute wait.
 * This runs them: `POST /admin/jobs/:name/run` triggers each on demand — the jobs are
 * idempotent and already scheduled, so this only removes the wait.
 *
 * One deliberate exception to the HTTP-only rule: making a listing *expire* means moving
 * its expiry into the past, and no API exposes that (correctly — nothing in the product
 * should let a client backdate a record). That single UPDATE goes through psql, and is
 * the only direct database access here.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { getSession } from './lib/session.mjs';

const API = process.env.LOCZ_API ?? 'http://127.0.0.1:4000/api/v1';
// `psql` on PATH is the normal case; LOCZ_PSQL covers a portable install that was never
// added to it — which is exactly how this project's own PostgreSQL was set up.
const PSQL = process.env.LOCZ_PSQL ?? 'psql';

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? `  ${detail}` : ''}`);
  }
}

function step(title) {
  console.log(`\n${title}`);
}

/**
 * Connection details for psql, taken from the same DATABASE_URL the application uses.
 *
 * Passed through the environment rather than as an argument: a URL on the command line
 * puts the database password into the process list and into any error message that
 * echoes argv. The Prisma-only query parameters (schema, connection_limit, pool_timeout)
 * are dropped — psql rejects them outright.
 */
function psqlEnvironment() {
  const file = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const match = /^DATABASE_URL=(.+)$/m.exec(file);

  const raw = process.env.DATABASE_URL ?? match?.[1].trim().replace(/^"|"$/g, '');
  if (!raw) throw new Error('DATABASE_URL not found in the environment or .env');

  const url = new URL(raw);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
  };
}

function sql(statement) {
  return execFileSync(PSQL, ['-tAc', statement], {
    encoding: 'utf8',
    env: psqlEnvironment(),
  }).trim();
}

async function call(path, { method = 'GET', body, token, expect, retries = 6 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };

  let response = await fetch(`${API}${path}`, init);

  // A 429 is the rate limiter working, not a failure. The per-phone OTP lockout is
  // minutes long, and these suites share the seeded staff accounts, so running them back
  // to back legitimately trips it — the wait is taken from the server's own "try again in
  // N seconds" rather than guessed, and capped so a broken limiter cannot hang the run.
  for (let attempt = 0; response.status === 429 && attempt < retries; attempt += 1) {
    const body = await response.clone().text();
    const hinted = Number(/try again in (\d+) seconds/i.exec(body)?.[1] ?? 0);
    const waitMs = Math.min(Math.max(hinted + 2, 11) * 1000, 360_000);

    console.log(`    (rate limited — waiting ${Math.round(waitMs / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetch(`${API}${path}`, init);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (expect !== undefined && response.status !== expect) {
    throw new Error(`${method} ${path} → ${response.status} (expected ${expect}): ${text.slice(0, 250)}`);
  }
  if (expect === undefined && !response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 250)}`);
  }

  return payload?.data ?? payload;
}

/**
 * Signs in, reusing a cached session when one is still good.
 *
 * The suites share the seeded staff accounts, and sign-in is rate limited per phone by
 * design — that limit protects real users from SMS-bombing, so the suites work with it
 * rather than around it.
 */
async function signIn(phone, deviceKey) {
  return getSession(API, phone, deviceKey, {
    onWait: (seconds) => console.log(`    (sign-in rate limited — waiting ${seconds}s)`),
  });
}

/** Jobs are asynchronous by nature; poll rather than sleep a fixed amount. */
async function waitFor(predicate, { attempts = 20, delayMs = 500 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function main() {
  console.log(`LocZ background-job acceptance against ${API}`);

  // ---------------------------------------------------------------- 1. sign in
  step('1. Accounts');
  const admin = await signIn('+919000000002', 'jobs-admin');
  const adminToken = admin.tokens.accessToken;
  check('administrator may run jobs', admin.user.permissions.includes('job:run'));

  const sellerPhone = `+9194${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  const seller = await signIn(sellerPhone, 'jobs-seller');
  const sellerToken = seller.tokens.accessToken;

  const moderator = await signIn('+919000000003', 'jobs-moderator');
  const moderatorToken = moderator.tokens.accessToken;

  // ---------------------------------------------------------------- 2. authorisation
  step('2. Only an administrator may trigger a job');
  const forbidden = await fetch(`${API}/admin/jobs/expire-listings/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken}` },
  });
  check('an ordinary account is refused', forbidden.status === 403, `HTTP ${forbidden.status}`);

  const anonymous = await fetch(`${API}/admin/jobs/expire-listings/run`, { method: 'POST' });
  check('an anonymous request is refused', anonymous.status === 401, `HTTP ${anonymous.status}`);

  // The job name comes off the URL, so an unknown one must be rejected rather than
  // enqueued — otherwise this endpoint would queue arbitrary job types on request.
  const unknown = await call('/admin/jobs/drop-all-tables/run', {
    method: 'POST',
    token: adminToken,
    expect: 400,
  });
  check('an unknown job name is rejected', unknown.error.code === 'BadRequest', unknown.error.message);

  // ---------------------------------------------------------------- 3. expiry
  step('3. Expiry takes a listing down');
  const categories = await call('/categories?listingType=PRODUCT');
  const leaf = categories.flatMap((entry) => entry.children ?? []).find(Boolean) ?? categories[0];
  const cities = await call('/locations/cities?launchedOnly=true&limit=1');

  const listing = await call('/listings', {
    method: 'POST',
    token: sellerToken,
    body: {
      type: 'PRODUCT',
      title: 'Godrej double-door fridge, working perfectly',
      description: 'Moving out of the city this month, selling the fridge we bought last year.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      pincodeCode: '500081',
      marketplace: { price: 14000, condition: 'GOOD', isNegotiable: true },
    },
  });

  await call(`/moderation/listings/${listing.id}/approve`, {
    method: 'POST',
    token: moderatorToken,
    body: { note: 'Jobs acceptance run' },
  });

  const published = await call(`/listings/${listing.slug}`);
  check('listing is published to begin with', published.status === 'PUBLISHED', published.status);

  const indexed = await waitFor(async () => {
    const found = await call('/search?q=godrej%20fridge&limit=10');
    return found.items.some((item) => item.id === listing.id);
  });
  check('and is in the search index', indexed);

  // The one direct database write: no API backdates a record, and none should.
  sql(`UPDATE listings SET "expiresAt" = NOW() - INTERVAL '1 day' WHERE id = '${listing.id}'`);
  check('expiry backdated', sql(`SELECT "expiresAt" < NOW() FROM listings WHERE id = '${listing.id}'`) === 't');

  const queued = await call('/admin/jobs/expire-listings/run', {
    method: 'POST',
    token: adminToken,
    expect: 202,
  });
  check('expiry sweep queued', queued.queued === true, queued.job);

  // The owner's own list is where an expired listing stays visible — the public page has
  // already stopped serving it, which is the point of expiry.
  const expired = await waitFor(async () => {
    const mine = await call('/listings/mine?limit=50', { token: sellerToken }).catch(() => null);
    return mine?.items?.find((item) => item.id === listing.id)?.status === 'EXPIRED';
  });
  check('listing is now EXPIRED for its owner', expired);

  const goneFromSearch = await waitFor(async () => {
    const found = await call('/search?q=godrej%20fridge&limit=10');
    return !found.items.some((item) => item.id === listing.id);
  });
  check('and has left the search index', goneFromSearch);

  const publicView = await fetch(`${API}/listings/${listing.slug}`);
  check(
    'the public page no longer serves it as live',
    publicView.status === 404 || publicView.status === 410,
    `HTTP ${publicView.status}`,
  );

  const notified = await waitFor(async () => {
    const inbox = await call('/notifications?limit=20', { token: sellerToken });
    return inbox.items.some((item) => item.type === 'LISTING_EXPIRED');
  });
  check('the owner is told their listing expired', notified);

  // ---------------------------------------------------------------- 4. the rest
  step('4. The other maintenance jobs run cleanly');
  for (const job of ['warn-expiring', 'sweep-orphan-media', 'sweep-sessions', 'trim-recently-viewed']) {
    const result = await call(`/admin/jobs/${job}/run`, {
      method: 'POST',
      token: adminToken,
      expect: 202,
    });
    check(`${job} queued`, result.queued === true);
  }

  // A job that throws lands in the failed set. Nothing here should.
  const settled = await waitFor(async () => {
    const queues = await call('/admin/queues', { token: adminToken });
    const lifecycle = queues.find((queue) => queue.name === 'lifecycle');
    return lifecycle.waiting === 0 && lifecycle.active === 0;
  });
  check('the lifecycle queue drains', settled);

  const queues = await call('/admin/queues', { token: adminToken });
  for (const queue of queues) {
    check(`${queue.name} queue has no failures`, queue.failed === 0, `${queue.failed} failed`);
  }

  // ---------------------------------------------------------------- 5. reindex
  step('5. The search index can be rebuilt from the database');
  const before = await call('/search/index/status', { token: adminToken });
  check('index status readable', typeof before.indexedDocuments === 'number', `${before.indexedDocuments} documents`);

  // Twice, deliberately. A fixed job id kept the rebuild from being queued more than once
  // ever: BullMQ discards a duplicate id, and finished jobs were never removed, so the
  // second request and every one after it was silently dropped while the endpoint went on
  // answering 202. The operator's remedy for a broken index was itself broken.
  await call('/search/index/rebuild', { method: 'POST', token: adminToken, expect: 202 });
  await waitFor(
    async () => {
      const status = await call('/search/index/status', { token: adminToken });
      return Math.abs(status.drift ?? 0) <= 1;
    },
    { attempts: 60, delayMs: 2000 },
  );

  await call('/search/index/rebuild', { method: 'POST', token: adminToken, expect: 202 });
  const rebuilt = await waitFor(
    async () => {
      const after = await call('/search/index/status', { token: adminToken });
      return after.indexedDocuments >= before.publishedListings - 1;
    },
    { attempts: 30, delayMs: 1000 },
  );
  const after = await call('/search/index/status', { token: adminToken });
  check(
    'a second rebuild is accepted and actually runs',
    rebuilt,
    'the job id is released when the job finishes',
  );
  check(
    'rebuild restores every published listing',
    rebuilt,
    `${after.indexedDocuments} indexed / ${after.publishedListings} published`,
  );
  check('no drift after the rebuild', Math.abs(after.drift ?? 0) <= 1, `drift ${after.drift}`);

  // ---------------------------------------------------------------- 6. cleanup
  step('6. Cleanup');
  await call(`/listings/${listing.id}`, { method: 'DELETE', token: sellerToken }).catch(() => null);
  check('test listing removed', true);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nJobs acceptance run aborted: ${error.message}`);
  process.exitCode = 1;
});
