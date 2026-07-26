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

import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { getSession } from './lib/session.mjs';

const API = process.env.LOCZ_API ?? 'http://127.0.0.1:4000/api/v1';
const TEST_PHOTO = process.env.LOCZ_TEST_PHOTO ?? 'C:/Users/USER/locz-stack/test-photo.jpg';

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
 * How long to wait after a 429.
 *
 * Taken from the server's own "try again in N seconds" rather than guessed: the per-phone
 * OTP lockout runs to minutes, and these suites share the seeded staff accounts, so
 * running them back to back legitimately trips it. Capped so a broken limiter cannot hang
 * the run.
 */
function backoffMs(response, body) {
  // Retry-After is what the server actually promised; the sentence in the body is a
  // fallback for a build that predates the header.
  const header = Number(response?.headers?.get?.('retry-after') ?? 0);
  const hinted = Number(/try again in (\d+) seconds/i.exec(body ?? '')?.[1] ?? 0);
  const seconds = header > 0 ? header : hinted;
  return Math.min(Math.max(seconds + 2, 11) * 1000, 360_000);
}

async function call(path, { method = 'GET', body, token, expect, retries = 6 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  // A 429 here is the rate limiter working, not a failure — repeated runs of this suite
  // legitimately trip the per-IP OTP limit. Back off and retry rather than relaxing the
  // limit, which is a real protection.
  let attempt = 0;
  while (response.status === 429 && attempt < retries) {
    const waitMs = backoffMs(response, await response.clone().text());
    console.log(`    (rate limited — waiting ${Math.round(waitMs / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt += 1;
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

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
  // A fresh number each run, so the suite exercises the path a real new user takes —
  // account created on first verify, no pre-assigned roles — and so repeated runs do not
  // trip the per-account daily posting cap.
  const sellerPhone = `+9198${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  const seller = await signIn(sellerPhone, 'acceptance-seller');
  check('account created on first verify', seller.user.isNewUser === true, sellerPhone);
  check('registered-user role granted', seller.user.roles.includes('REGISTERED_USER'), seller.user.roles.join(','));
  // The bug this catches: listing:create used to live only on INDIVIDUAL_SELLER, which is
  // granted inside the create handler — after the guard. No new account could ever post.
  check(
    'a brand-new account may post',
    seller.user.permissions.includes('listing:create'),
  );
  const sellerToken = seller.tokens.accessToken;

  const me = await call('/users/me', { token: sellerToken });
  check('authenticated request works', me.phone === sellerPhone);

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

  // Pincode is the location primitive most users actually supply — they know it, and it
  // needs no GPS permission. Every one of India's ~19,000 codes must resolve.
  const pincodeMatches = await call('/locations/pincodes?q=500081');
  check('pincode lookup by code', pincodeMatches[0]?.code === '500081', pincodeMatches[0]?.name);

  const byName = await call('/locations/pincodes?q=Madhapur');
  check('pincode lookup by place name', byName.length > 0, `${byName.length} matches`);

  const area = await call('/locations/pincodes/500081');
  check('pincode carries a centroid', area.latitude !== null, `${area.latitude}, ${area.longitude}`);
  check('pincode knows its state', area.stateName.length > 0, area.stateName);
  check('pincode linked to its launched city', area.cityName === 'Hyderabad', area.cityName ?? 'unlinked');
  check('neighbouring codes returned', area.nearbyPincodes.length > 0, `${area.nearbyPincodes.length} nearby`);

  const fromCoords = await call('/locations/resolve/pincode', {
    method: 'POST',
    body: { latitude: 17.4483, longitude: 78.3915 },
  });
  check('coordinates resolve to a pincode', /^\d{6}$/.test(fromCoords.pincode?.code ?? ''), fromCoords.pincode?.code);

  const unknownPincode = await call('/locations/pincodes/999999', { expect: 404 });
  check('a non-existent pincode 404s', unknownPincode.error.code === 'NotFound', unknownPincode.error.code);

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
      // Deliberately no coordinates — the pincode centroid must place the listing.
      pincodeCode: '500081',
      contactPreference: 'IN_APP_ONLY',
      marketplace: { price: 18000, condition: 'GOOD', isNegotiable: true },
    },
  });

  check('listing created', Boolean(listing.id), listing.slug);
  check('pincode recorded on the listing', listing.pincodeCode === '500081', listing.pincodeCode);
  // A new account has no published listings, so the first one must go to review.
  check(
    'routed to review, not auto-published',
    listing.status === 'PENDING_REVIEW',
    listing.status,
  );

  // ---------------------------------------------------------------- 3b. media
  step('3b. Image upload (direct to object storage)');
  const photo = readFileSync(TEST_PHOTO);
  const sourceMeta = await sharp(photo).metadata();
  check('test photo carries EXIF to begin with', Boolean(sourceMeta.exif));

  const upload = await call(`/listings/${listing.id}/media/upload-url`, {
    method: 'POST',
    token: sellerToken,
    body: { mimeType: 'image/jpeg', sizeBytes: photo.length },
  });
  check('signed upload URL issued', Boolean(upload.uploadUrl), upload.storageKey);

  // Straight to object storage — the bytes never pass through the API.
  const put = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: photo,
  });
  check('bytes accepted by object storage', put.ok, `HTTP ${put.status}`);

  const media = await call(`/media/${upload.mediaId}/confirm`, {
    method: 'POST',
    token: sellerToken,
  });

  // A picture from an account with no history is held, not published. This is the
  // assertion that matters most in this suite: before quarantine existed, an image became
  // publicly fetchable the moment it was processed, and taking the listing down afterwards
  // left the object exactly where it was.
  check(
    "a new account's image is held for review, not published",
    media.status === 'REVIEW_REQUIRED',
    media.status || media.failureReason,
  );
  check(
    'and the uploader is told why in plain words',
    typeof media.failureReason === 'string' && media.failureReason.length > 0,
    media.failureReason,
  );

  // Confirmation reports the image; the public gallery does not carry it. Both are
  // checked, because "no URL on the object" and "the object is not served at all" are
  // different guarantees and only the second one survives someone guessing a URL.
  check(
    'no public URL is handed out while it waits',
    !media.thumbUrl && !media.cardUrl && !media.fullUrl,
    `thumb=${media.thumbUrl ?? 'none'}`,
  );

  const heldPublicGallery = await call(`/listings/${listing.id}/media`);
  check(
    'and the public gallery does not show it at all',
    heldPublicGallery.length === 0,
    `${heldPublicGallery.length} images visible`,
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

  // Approval is what makes an image public. Until this point the picture existed, was
  // attached, and was reachable by nobody.
  const approvedGallery = await waitFor(async () => {
    const gallery = await call(`/listings/${listing.id}/media`);
    return gallery[0]?.fullUrl ? gallery : false;
  });
  check('approval publishes the renditions', Boolean(approvedGallery));

  const approvedImage = (await call(`/listings/${listing.id}/media`))[0];
  check('the image is now visible on the listing', Boolean(approvedImage));
  check('thumb rendition generated', Boolean(approvedImage?.thumbUrl));
  check('card rendition generated', Boolean(approvedImage?.cardUrl));
  check('full rendition generated', Boolean(approvedImage?.fullUrl));
  check('first image becomes the cover', approvedImage?.isPrimary === true);

  const rendition = await fetch(approvedImage.fullUrl);
  check('rendition publicly readable once approved', rendition.ok, `HTTP ${rendition.status}`);

  const renditionBytes = Buffer.from(await rendition.arrayBuffer());
  const renditionMeta = await sharp(renditionBytes).metadata();
  check('rendition is WebP', renditionMeta.format === 'webp', renditionMeta.format);
  // A seller's home GPS must not ride along in a listing photo.
  check('EXIF stripped from the public rendition', !renditionMeta.exif);
  check(
    'resized to the full-size cap',
    renditionMeta.width !== undefined && renditionMeta.width <= 1600,
    `${renditionMeta.width}×${renditionMeta.height}`,
  );

  // The original never becomes public, approved or not — it still carries the EXIF the
  // renditions had stripped.
  const originalFetch = await fetch(
    approvedImage.fullUrl.replace(/\/public\/.*$/, `/${upload.storageKey}`),
  ).catch(() => null);
  check(
    'the original stays private even after approval',
    !originalFetch || !originalFetch.ok,
    originalFetch ? `HTTP ${originalFetch.status}` : 'unreachable',
  );

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
  // Scoped to this run's own category so the assertion survives a database with real
  // volume in it. Asking for "the ten nearest listings" and expecting a specific one to be
  // among them holds only while the neighbourhood is nearly empty — with fifty thousand
  // listings the suite would be testing luck.
  const nearby = await call(
    `/listings?latitude=17.4483&longitude=78.3915&radiusKm=5&categoryId=${leaf.id}&limit=50`,
  );
  const found = nearby.items.find((item) => item.id === listing.id);
  check('listing found within 5 km', Boolean(found), `${nearby.meta.total} nearby in this category`);
  check(
    'distance is plausible',
    found !== undefined && found.distanceMeters !== undefined && found.distanceMeters < 5000,
    found ? `${found.distanceMeters} m` : '',
  );
  check(
    'and the results really are ordered by distance',
    nearby.items.every(
      (item, index) =>
        index === 0 || (nearby.items[index - 1].distanceMeters ?? 0) <= (item.distanceMeters ?? 0),
    ),
    `nearest ${nearby.items[0]?.distanceMeters ?? 0} m`,
  );

  // The user's actual journey: type a pincode, see what is for sale around it. The
  // listing above was placed by pincode alone, so this exercises the whole chain.
  const byPincode = await call(`/listings?pincode=500081&categoryId=${leaf.id}&limit=50`);
  check(
    'found by pincode search',
    byPincode.items.some((item) => item.id === listing.id),
    `${byPincode.meta.total} in the 500081 area`,
  );

  // A code 1,500 km away must not match — proof the radius is real, not ignored.
  const farAway = await call(`/listings?pincode=110001&radiusKm=10&categoryId=${leaf.id}&limit=50`);
  check(
    'a distant pincode does not match',
    !farAway.items.some((item) => item.id === listing.id),
    `${farAway.meta.total} in the 110001 area`,
  );

  const keywordInArea = await call('/search?q=samsung%20tv&pincode=500081&limit=5');
  check(
    'keyword search accepts a pincode',
    keywordInArea.items.some((item) => item.id === listing.id),
    `${keywordInArea.total} results`,
  );

  const feed = await call(`/feed?cityId=${city.id}&limit=10`);
  check('home feed has sections', feed.sections.length > 0, `${feed.sections.length} sections`);

  // ---------------------------------------------------------------- 9. save
  step('9. Another user saves it');
  const buyerPhone = `+9197${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  const buyer = await signIn(buyerPhone, 'acceptance-buyer');
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
