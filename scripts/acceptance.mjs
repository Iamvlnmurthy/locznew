#!/usr/bin/env node
/**
 * Executable version of docs/ACCEPTANCE.md — the Phase 1 gate.
 *
 *   node scripts/acceptance.mjs
 *
 * Drives the whole end-to-end flow against a running API: mock-OTP sign-in, city
 * selection, listing creation, moderation, approval, search indexing, saving, enquiry
 * and notification. Exits non-zero if any step fails, so it can gate a deploy.
 *
 * Deliberately talks HTTP only — no direct database access. If a step passes here, it
 * passes for a real client too.
 */

const API = process.env.LOCZ_API ?? 'http://127.0.0.1:4000/api/v1';

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

async function call(path, { method = 'GET', body, token, expect } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (expect !== undefined && response.status !== expect) {
    throw new Error(
      `${method} ${path} → ${response.status} (expected ${expect}): ${text.slice(0, 300)}`,
    );
  }
  if (expect === undefined && !response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  }

  return payload?.data ?? payload;
}

async function signIn(phone, deviceKey) {
  const requested = await call('/auth/otp/request', { method: 'POST', body: { phone } });
  if (!requested.debugCode) {
    throw new Error('No debugCode returned — is OTP_PROVIDER=mock?');
  }
  const session = await call('/auth/otp/verify', {
    method: 'POST',
    body: {
      phone,
      code: requested.debugCode,
      device: { deviceKey, platform: 'WEB', name: 'Acceptance run' },
    },
  });
  return session;
}

/** Search is eventually consistent; give the index worker a moment to catch up. */
async function waitFor(predicate, { attempts = 15, delayMs = 700 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function main() {
  console.log(`LocZ acceptance run against ${API}`);

  // ---------------------------------------------------------------- 0. health
  step('0. Service health');
  const health = await call('/health/ready');
  check('API ready', health.status === 'ok');
  check('database reachable', health.checks.database === true);
  check('redis reachable', health.checks.redis === true);

  // ---------------------------------------------------------------- 1. sign in
  step('1. Mock OTP sign-in');
  const seller = await signIn('+919000000004', 'acceptance-seller');
  check('seller signed in', Boolean(seller.tokens.accessToken), seller.user.displayName);
  check('roles resolved', seller.user.roles.includes('INDIVIDUAL_SELLER'), seller.user.roles.join(','));
  const sellerToken = seller.tokens.accessToken;

  const me = await call('/users/me', { token: sellerToken });
  check('authenticated request works', me.phone === '+919000000004');

  // ---------------------------------------------------------------- 2. location
  step('2. Location');
  const cities = await call('/locations/cities?launchedOnly=true&limit=5');
  check('launched cities seeded', cities.length > 0, `${cities.length} cities`);
  const city = cities.find((entry) => entry.slug === 'hyderabad') ?? cities[0];

  const resolved = await call('/locations/resolve', {
    method: 'POST',
    body: { latitude: 17.4483, longitude: 78.3915 },
  });
  check('coordinates resolve to a city', resolved.city?.slug === 'hyderabad', resolved.city?.name);
  check(
    'nearby localities returned',
    resolved.nearbyLocalities.length > 0,
    `${resolved.nearbyLocalities.length} localities`,
  );

  // ---------------------------------------------------------------- 3. create
  step('3. Create a marketplace listing');
  const categories = await call('/categories?listingType=PRODUCT');
  const leaf = categories.flatMap((c) => c.children ?? []).find(Boolean) ?? categories[0];

  const listing = await call('/listings', {
    method: 'POST',
    token: sellerToken,
    body: {
      type: 'PRODUCT',
      title: 'Samsung 43 inch smart TV in good condition',
      description:
        'Bought two years ago, moving cities so selling. Includes the original remote and box.',
      categoryId: leaf.id,
      cityId: city.id,
      latitude: 17.4483,
      longitude: 78.3915,
      contactPreference: 'IN_APP_ONLY',
      marketplace: { price: 18000, condition: 'GOOD', isNegotiable: true },
    },
  });

  check('listing created', Boolean(listing.id), listing.slug);
  // The seeded seller has no published listings, so the first one must go to review.
  check(
    'routed to review, not auto-published',
    listing.status === 'PENDING_REVIEW',
    listing.status,
  );

  // ---------------------------------------------------------------- 4. spam is blocked
  step('4. Moderation blocks an obvious scam');
  const spam = await call('/listings', {
    method: 'POST',
    token: sellerToken,
    body: {
      type: 'PRODUCT',
      title: 'INSTANT LOAN APPROVED!!!',
      description:
        'Pay advance payment first. Call 9876543210 or 9876543211 now. Details bit.ly/quick-loan',
      categoryId: leaf.id,
      cityId: city.id,
      marketplace: { price: 1, condition: 'NEW' },
    },
  });
  check('spam listing rejected outright', spam.status === 'REJECTED', spam.status);

  // ---------------------------------------------------------------- 5. queue
  step('5. Moderation queue');
  const moderator = await signIn('+919000000003', 'acceptance-moderator');
  const moderatorToken = moderator.tokens.accessToken;
  check('moderator signed in', moderator.user.roles.includes('MODERATOR'));

  const queue = await call('/moderation/queue?limit=20', { token: moderatorToken });
  const queued = queue.items.find((item) => item.id === listing.id);
  check('listing appears in the queue', Boolean(queued));
  check(
    'flagged as a new account',
    queued?.systemReasons.includes('NEW_ACCOUNT'),
    queued?.systemReasons.join(', '),
  );

  // ---------------------------------------------------------------- 6. approve
  step('6. Approval publishes');
  const approved = await call(`/moderation/listings/${listing.id}/approve`, {
    method: 'POST',
    token: moderatorToken,
    body: { note: 'Acceptance run' },
  });
  check('status is PUBLISHED', approved.status === 'PUBLISHED', approved.status);

  const detail = await call(`/listings/${listing.slug}`);
  check('publicly visible without a token', detail.title.startsWith('Samsung'));
  check('price returned', detail.price === 18000, `₹${detail.price}`);
  check('seller phone hidden by default', detail.owner.phone === null);

  // ---------------------------------------------------------------- 7. search
  step('7. Searchable');
  const indexed = await waitFor(async () => {
    const result = await call('/search?q=samsung%20tv&limit=5');
    return result.items.some((item) => item.id === listing.id);
  });
  const search = await call('/search?q=samsung%20tv&limit=5');
  check('found by keyword search', indexed, `usedSearchIndex=${search.usedSearchIndex}`);
  check('search used Meilisearch, not the fallback', search.usedSearchIndex === true);

  // ---------------------------------------------------------------- 8. nearby
  step('8. Nearby search (PostGIS)');
  const nearby = await call(
    `/listings?latitude=17.4483&longitude=78.3915&radiusKm=5&limit=10`,
  );
  const found = nearby.items.find((item) => item.id === listing.id);
  check('listing found within 5 km', Boolean(found), `${nearby.meta.total} nearby`);
  check(
    'distance is plausible',
    found !== undefined && found.distanceMeters !== undefined && found.distanceMeters < 5000,
    found ? `${found.distanceMeters} m` : '',
  );

  const feed = await call(`/feed?cityId=${city.id}&limit=10`);
  check('home feed has sections', feed.sections.length > 0, `${feed.sections.length} sections`);

  // ---------------------------------------------------------------- 9. save
  step('9. Another user saves it');
  const buyer = await signIn('+919000000005', 'acceptance-buyer');
  const buyerToken = buyer.tokens.accessToken;

  const saved = await call(`/listings/${listing.id}/save`, { method: 'POST', token: buyerToken });
  check('saved', saved.saved === true, `saveCount=${saved.saveCount}`);

  const savedAgain = await call(`/listings/${listing.id}/save`, {
    method: 'POST',
    token: buyerToken,
  });
  check('saving twice is idempotent', savedAgain.saveCount === saved.saveCount);

  const savedList = await call('/listings/saved', { token: buyerToken });
  check('appears in saved list', savedList.items.some((item) => item.id === listing.id));

  // ---------------------------------------------------------------- 10. enquiry
  step('10. Enquiry');
  const conversation = await call('/conversations', {
    method: 'POST',
    token: buyerToken,
    body: { listingId: listing.id, message: 'Is this still available?' },
  });
  check('conversation created', Boolean(conversation.id));
  check('message stored', conversation.messages.length === 1, conversation.messages[0]?.body);

  const again = await call('/conversations', {
    method: 'POST',
    token: buyerToken,
    body: { listingId: listing.id, message: 'Still there?' },
  });
  check('second enquiry reuses the same thread', again.id === conversation.id);

  // ---------------------------------------------------------------- 11. notification
  step('11. Owner is notified');
  const notified = await waitFor(async () => {
    const notifications = await call('/notifications?limit=10', { token: sellerToken });
    return notifications.items.some((item) => item.type === 'NEW_ENQUIRY');
  });
  const notifications = await call('/notifications?limit=10', { token: sellerToken });
  const enquiry = notifications.items.find((item) => item.type === 'NEW_ENQUIRY');
  check('NEW_ENQUIRY notification received', notified, enquiry?.title);

  const unread = await call('/notifications/unread-count', { token: sellerToken });
  check('unread count non-zero', unread.count > 0, `${unread.count} unread`);

  // ---------------------------------------------------------------- 12. lifecycle
  step('12. Lifecycle and cleanup');
  const sold = await call(`/listings/${listing.id}/sold`, { method: 'POST', token: sellerToken });
  check('marked as sold', sold.status === 'SOLD', sold.status);

  const goneFromSearch = await waitFor(async () => {
    const result = await call('/search?q=samsung%20tv&limit=10');
    return !result.items.some((item) => item.id === listing.id);
  });
  check('sold listing leaves the search index', goneFromSearch);

  await call(`/listings/${listing.id}`, { method: 'DELETE', token: sellerToken, expect: 204 });
  await call(`/listings/${spam.id}`, { method: 'DELETE', token: sellerToken, expect: 204 });
  check('listings deleted', true);

  // ---------------------------------------------------------------- summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nAcceptance run aborted: ${error.message}`);
  process.exitCode = 1;
});
