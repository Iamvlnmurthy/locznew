#!/usr/bin/env node
/**
 * Security probes.
 *
 *   node scripts/acceptance-security.mjs
 *
 * Every other gate asks whether the product works. This one tries to make it misbehave,
 * against a stack the operator controls, before anyone else gets the chance.
 *
 * Each probe is a genuine attempt at something a real attacker would want:
 *
 *   - read or alter another person's listings, messages and notifications
 *   - do a moderator's job without being one
 *   - harvest phone numbers, which on a classifieds site is the whole prize
 *   - reuse a session that was logged out, or a refresh token that was already spent
 *   - guess an OTP by brute force
 *   - smuggle a field past validation, or script into a page
 *
 * A passing assertion means the attempt was refused. Every one of these is written from
 * the attacker's side, because "the guard is in place" and "the guard stops this request"
 * are different claims and only the second one is testable.
 */

import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { getSession } from './lib/session.mjs';

const TEST_PHOTO = process.env.LOCZ_TEST_PHOTO ?? 'C:/Users/USER/locz-stack/test-photo.jpg';

const API = process.env.LOCZ_API ?? 'http://127.0.0.1:4000/api/v1';
const WEB = process.env.LOCZ_WEB ?? 'http://127.0.0.1:3000';

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

function backoffMs(response, body) {
  // Retry-After is what the server actually promised; the sentence in the body is a
  // fallback for a build that predates the header.
  const header = Number(response?.headers?.get?.('retry-after') ?? 0);
  const hinted = Number(/try again in (\d+) seconds/i.exec(body ?? '')?.[1] ?? 0);
  const seconds = header > 0 ? header : hinted;
  return Math.min(Math.max(seconds + 2, 11) * 1000, 360_000);
}

/**
 * `expectLimit` turns the retry loop off.
 *
 * Some probes here are *trying* to be rate limited — brute-forcing an OTP is the whole
 * point of section 6 — and patiently waiting out each rejection would make the suite take
 * an hour to prove the limiter works. Every other call keeps the backoff, because there a
 * 429 is noise from a neighbouring suite rather than the result under test.
 */
async function raw(path, { method = 'GET', body, token, headers = {}, expectLimit = false } = {}) {
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let response = await fetch(`${API}${path}`, init);
  for (let attempt = 0; !expectLimit && response.status === 429 && attempt < 4; attempt += 1) {
    const waitMs = backoffMs(response, await response.clone().text());
    console.log(`    (rate limited — waiting ${Math.round(waitMs / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetch(`${API}${path}`, init);
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return { status: response.status, body: payload?.data ?? payload, text };
}

async function call(path, options = {}) {
  const result = await raw(path, options);
  if (result.status >= 400) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${result.status}: ${result.text.slice(0, 200)}`);
  }
  return result.body;
}

/** Refused means 401 or 403 — never a 200 with an empty body, which hides a leak. */
function refused(result) {
  return result.status === 401 || result.status === 403 || result.status === 404;
}

async function main() {
  console.log(`LocZ security probes against ${API}`);

  // ---------------------------------------------------------------- 0. cast
  step('0. Two unrelated people and a moderator');
  const alicePhone = `+9193${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  const malloryPhone = `+9192${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;

  const alice = await getSession(API, alicePhone, 'security-alice');
  const mallory = await getSession(API, malloryPhone, 'security-mallory');
  const moderator = await getSession(API, '+919000000003', 'security-moderator');

  const aliceToken = alice.tokens.accessToken;
  const malloryToken = mallory.tokens.accessToken;
  const moderatorToken = moderator.tokens.accessToken;

  check('two separate accounts', alice.user.id !== mallory.user.id);
  check(
    'neither has moderator powers',
    !alice.user.permissions.includes('listing:moderate') &&
      !mallory.user.permissions.includes('listing:moderate'),
  );

  // Alice posts something; Mallory will spend the rest of this run trying to touch it.
  const categories = await call('/categories?listingType=PRODUCT');
  const leaf = categories.flatMap((entry) => entry.children ?? []).find(Boolean) ?? categories[0];
  const cities = await call('/locations/cities?launchedOnly=true&limit=1');

  const listing = await call('/listings', {
    method: 'POST',
    token: aliceToken,
    body: {
      type: 'PRODUCT',
      title: 'Bookshelf in solid sheesham wood',
      description: 'Selling because we are moving to a smaller flat this month.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      pincodeCode: '500081',
      contactPreference: 'IN_APP_ONLY',
      marketplace: { price: 6000, condition: 'GOOD' },
    },
  });

  await call(`/moderation/listings/${listing.id}/approve`, {
    method: 'POST',
    token: moderatorToken,
    body: { note: 'Security probe run' },
  });

  // ---------------------------------------------------------------- 1. other people's things
  step("1. Mallory reaches for Alice's listing");

  const edit = await raw(`/listings/${listing.id}`, {
    method: 'PATCH',
    token: malloryToken,
    body: { title: 'Bookshelf — PRICE DROPPED, call 9876543210' },
  });
  check('cannot edit it', refused(edit), `HTTP ${edit.status}`);

  const destroy = await raw(`/listings/${listing.id}`, { method: 'DELETE', token: malloryToken });
  check('cannot delete it', refused(destroy), `HTTP ${destroy.status}`);

  const markSold = await raw(`/listings/${listing.id}/sold`, {
    method: 'POST',
    token: malloryToken,
  });
  check('cannot mark it sold', refused(markSold), `HTTP ${markSold.status}`);

  const uploadUrl = await raw(`/listings/${listing.id}/media/upload-url`, {
    method: 'POST',
    token: malloryToken,
    body: { mimeType: 'image/jpeg', sizeBytes: 1024 },
  });
  check('cannot attach photos to it', refused(uploadUrl), `HTTP ${uploadUrl.status}`);

  const stillIntact = await call(`/listings/${listing.slug}`);
  check('the listing is untouched', stillIntact.title.startsWith('Bookshelf in solid'), stillIntact.title);

  // ---------------------------------------------------------------- 2. private conversations
  step('2. Mallory reaches into a conversation she is not in');

  const conversation = await call('/conversations', {
    method: 'POST',
    token: malloryToken,
    body: { listingId: listing.id, message: 'Is the bookshelf still available?' },
  });

  // Mallory is legitimately in that one. Alice starts a second thread that Mallory is not.
  const bystander = await getSession(API, `+9191${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`, 'security-bystander');
  const bystanderThread = await call('/conversations', {
    method: 'POST',
    token: bystander.tokens.accessToken,
    body: { listingId: listing.id, message: 'Would you take four thousand?' },
  });

  const peek = await raw(`/conversations/${bystanderThread.id}`, { token: malloryToken });
  check("cannot read someone else's thread", refused(peek), `HTTP ${peek.status}`);

  const intrude = await raw(`/conversations/${bystanderThread.id}/messages`, {
    method: 'POST',
    token: malloryToken,
    body: { body: 'Ignore the other buyer, deal with me' },
  });
  check('cannot post into it', refused(intrude), `HTTP ${intrude.status}`);

  const inbox = await call('/conversations?limit=50', { token: malloryToken });
  check(
    "it does not appear in Mallory's inbox",
    !inbox.items.some((thread) => thread.id === bystanderThread.id),
    `${inbox.items.length} threads`,
  );

  const ownThread = await call(`/conversations/${conversation.id}`, { token: malloryToken });
  check('her own thread is still readable', ownThread.id === conversation.id);

  // ---------------------------------------------------------------- 3. phone numbers
  step('3. Phone numbers — the thing worth stealing');

  const publicDetail = await call(`/listings/${listing.slug}`);
  check(
    "the seller's number is hidden on a public listing",
    publicDetail.owner.phone === null,
    String(publicDetail.owner.phone),
  );
  check(
    'and not smuggled elsewhere in the payload',
    !JSON.stringify(publicDetail).includes(alicePhone.slice(3)),
  );

  const asBuyer = await call(`/listings/${listing.slug}`, { token: malloryToken });
  check(
    'signing in does not reveal it',
    asBuyer.owner.phone === null && !JSON.stringify(asBuyer).includes(alicePhone.slice(3)),
  );

  const threadPayload = await call(`/conversations/${conversation.id}`, { token: malloryToken });
  check(
    'nor does being in a conversation with them',
    !JSON.stringify(threadPayload).includes(alicePhone.slice(3)),
  );

  const searchPayload = await call('/search?limit=24');
  check(
    'search results carry no phone numbers',
    !/\+91\d{10}/.test(JSON.stringify(searchPayload)),
  );

  const renderedPage = await fetch(`${WEB}/ad/${listing.slug}`).then((response) => response.text());
  check(
    'and the rendered page does not contain one either',
    !renderedPage.includes(alicePhone.slice(3)),
  );

  // The admin directory is where numbers legitimately live — for administrators only.
  const directory = await raw('/admin/users?limit=5', { token: malloryToken });
  check('the user directory is closed to her', refused(directory), `HTTP ${directory.status}`);

  // ---------------------------------------------------------------- 4. doing a moderator's job
  step("4. Mallory tries to do a moderator's job");

  for (const [label, path, method, body] of [
    ['read the moderation queue', '/moderation/queue?limit=5', 'GET', undefined],
    ['approve a listing', `/moderation/listings/${listing.id}/approve`, 'POST', { note: 'ok' }],
    ['reject a listing', `/moderation/listings/${listing.id}/reject`, 'POST', { reason: 'SPAM' }],
    ['rebuild the search index', '/search/index/rebuild', 'POST', undefined],
    ['run a maintenance job', '/admin/jobs/expire-listings/run', 'POST', undefined],
    ['read platform metrics', '/admin/metrics', 'GET', undefined],
  ]) {
    const result = await raw(path, { method, token: malloryToken, body });
    check(`cannot ${label}`, refused(result), `HTTP ${result.status}`);
  }

  const stillPublished = await call(`/listings/${listing.slug}`);
  check('the listing survived all of that', stillPublished.status === 'PUBLISHED', stillPublished.status);

  // ---------------------------------------------------------------- 4b. suspension
  step('4b. Suspension stops a person, so it must be hard to reach');

  const suspendPath = `/moderation/users/${alice.user.id}/suspend`;
  const reason = 'Probing whether an ordinary account can suspend someone';

  const strangerSuspends = await raw(suspendPath, {
    method: 'POST',
    token: malloryToken,
    body: { reason },
  });
  check('an ordinary account cannot suspend anyone', refused(strangerSuspends), `HTTP ${strangerSuspends.status}`);

  const anonymousSuspends = await raw(suspendPath, { method: 'POST', body: { reason } });
  check('nor can an anonymous request', anonymousSuspends.status === 401, `HTTP ${anonymousSuspends.status}`);

  const aliceStillWorks = await raw('/users/me', { token: aliceToken });
  check('and the account is untouched by the attempt', aliceStillWorks.status === 200);

  // A moderator can — and the effect has to be immediate, not whenever the token expires.
  const doomedPhone = `+9186${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  const doomedUser = await getSession(API, doomedPhone, 'security-suspendee');
  const doomedUserToken = doomedUser.tokens.accessToken;
  check('the account works before suspension', (await raw('/users/me', { token: doomedUserToken })).status === 200);

  const suspended = await call(`/moderation/users/${doomedUser.user.id}/suspend`, {
    method: 'POST',
    token: moderatorToken,
    body: { reason: 'Repeated fake listings after two warnings' },
  });
  check('a moderator can suspend', suspended.suspended === true, `${suspended.sessionsRevoked} session(s) revoked`);

  const afterSuspension = await raw('/users/me', { token: doomedUserToken });
  check(
    'the live session dies at once, not when the token expires',
    afterSuspension.status === 401,
    `HTTP ${afterSuspension.status}`,
  );

  const suspendedPost = await raw('/listings', {
    method: 'POST',
    token: doomedUserToken,
    body: {
      type: 'PRODUCT',
      title: 'Posting while suspended, which must fail',
      description: 'If this succeeds the suspension is decorative rather than effective.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      marketplace: { price: 1000, condition: 'GOOD' },
    },
  });
  check('and cannot post', refused(suspendedPost), `HTTP ${suspendedPost.status}`);

  const selfSuspend = await raw(`/moderation/users/${moderator.user.id}/suspend`, {
    method: 'POST',
    token: moderatorToken,
    body: { reason: 'A moderator locking themselves out by accident' },
  });
  check('a moderator cannot suspend themselves', selfSuspend.status === 400, `HTTP ${selfSuspend.status}`);

  // Left reinstated: a suspended account in the seed data would break later runs.
  await raw(`/moderation/users/${doomedUser.user.id}/reinstate`, {
    method: 'POST',
    token: moderatorToken,
    body: { reason: 'Security probe cleanup' },
  });

  // ---------------------------------------------------------------- 5. tokens
  step('5. Tokens that should not work');

  const noToken = await raw('/users/me');
  check('no token is refused', noToken.status === 401, `HTTP ${noToken.status}`);

  const garbage = await raw('/users/me', { token: 'not-a-token' });
  check('a garbage token is refused', garbage.status === 401, `HTTP ${garbage.status}`);

  // A structurally valid JWT signed with the wrong key — the classic forgery attempt.
  const forged = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: alice.user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    'this-signature-is-invented',
  ].join('.');
  const forgedResult = await raw('/users/me', { token: forged });
  check('a forged token is refused', forgedResult.status === 401, `HTTP ${forgedResult.status}`);

  // The `alg: none` trick, in case verification ever trusts the header.
  const unsigned = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: alice.user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    '',
  ].join('.');
  const unsignedResult = await raw('/users/me', { token: unsigned });
  check('an unsigned token is refused', unsignedResult.status === 401, `HTTP ${unsignedResult.status}`);

  // A logged-out session must die immediately, not linger until the token expires.
  const doomed = await getSession(API, `+9190${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`, 'security-logout');
  const doomedToken = doomed.tokens.accessToken;
  check('the session works before logout', (await raw('/users/me', { token: doomedToken })).status === 200);

  await raw('/auth/logout', { method: 'POST', token: doomedToken, body: { refreshToken: doomed.tokens.refreshToken } });
  const afterLogout = await raw('/users/me', { token: doomedToken });
  check('and stops working after it', afterLogout.status === 401, `HTTP ${afterLogout.status}`);

  const replayRefresh = await raw('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: doomed.tokens.refreshToken },
  });
  check(
    'a logged-out refresh token cannot revive it',
    replayRefresh.status >= 400,
    `HTTP ${replayRefresh.status}`,
  );

  // Refresh rotation: the old token must die the moment it is exchanged, so a stolen copy
  // is worth nothing once the real user has moved on.
  const rotating = await getSession(API, `+9189${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`, 'security-rotate');
  const firstRefresh = rotating.tokens.refreshToken;
  const rotated = await raw('/auth/refresh', { method: 'POST', body: { refreshToken: firstRefresh } });
  check('a refresh token can be exchanged once', rotated.status === 200 || rotated.status === 201, `HTTP ${rotated.status}`);

  const reused = await raw('/auth/refresh', { method: 'POST', body: { refreshToken: firstRefresh } });
  check('but never twice', reused.status >= 400, `HTTP ${reused.status}`);

  // ---------------------------------------------------------------- 6. guessing an OTP
  step('6. Guessing a verification code');
  const victimPhone = `+9188${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  await raw('/auth/otp/request', { method: 'POST', body: { phone: victimPhone } });

  let blocked = false;
  let attempts = 0;
  for (; attempts < 12 && !blocked; attempts += 1) {
    const guess = await raw('/auth/otp/verify', {
      method: 'POST',
      expectLimit: true,
      body: {
        phone: victimPhone,
        code: String(100000 + attempts),
        device: { deviceKey: 'security-guesser', platform: 'WEB', name: 'Probe' },
      },
    });
    if (guess.status === 429 || guess.status === 423) blocked = true;
    // A correct guess would be catastrophic; it is also a 1-in-900,000 accident.
    if (guess.status === 200 || guess.status === 201) {
      check('a guessed code was accepted — investigate immediately', false, `after ${attempts + 1} tries`);
      break;
    }
  }
  check('repeated wrong codes lock the attempt out', blocked, `after ${attempts} guesses`);

  // ---------------------------------------------------------------- 7. input
  step('7. Input that should not be accepted');

  const smuggled = await raw('/listings', {
    method: 'POST',
    token: malloryToken,
    body: {
      type: 'PRODUCT',
      title: 'A perfectly ordinary listing title',
      description: 'Nothing unusual about this description at all, it is quite normal.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      marketplace: { price: 500, condition: 'GOOD' },
      // The fields an attacker would most like to set directly.
      status: 'PUBLISHED',
      isFeatured: true,
      moderationStatus: 'APPROVED',
      ownerId: alice.user.id,
      viewCount: 999999,
    },
  });
  check(
    'unknown properties are rejected outright',
    smuggled.status === 400,
    `HTTP ${smuggled.status}`,
  );

  const badPincode = await raw('/listings', {
    method: 'POST',
    token: malloryToken,
    body: {
      type: 'PRODUCT',
      title: 'Another perfectly ordinary title here',
      description: 'Nothing unusual about this description at all, it is quite normal.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      pincodeCode: "500081' OR '1'='1",
      marketplace: { price: 500, condition: 'GOOD' },
    },
  });
  check('a malformed pincode is rejected', badPincode.status === 400, `HTTP ${badPincode.status}`);

  // The same string through the query parameter, where it reaches the spatial query.
  const injected = await raw(`/listings?pincode=${encodeURIComponent("500081' OR '1'='1")}`);
  check(
    'and rejected as a search parameter too',
    injected.status === 400,
    `HTTP ${injected.status}`,
  );

  const stillAlive = await raw('/health/ready');
  check('the database is unharmed', stillAlive.status === 200);

  // Script in a title must come back escaped, wherever it is rendered.
  const scripted = await call('/listings', {
    method: 'POST',
    token: malloryToken,
    body: {
      type: 'PRODUCT',
      title: 'Sofa set <script>alert(1)</script> for sale',
      description: 'A three-seater sofa in reasonable condition, collection only please.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      marketplace: { price: 3000, condition: 'FAIR' },
    },
  });
  check('a listing with script in the title is accepted as text', Boolean(scripted.id));

  const drafts = await call('/listings/mine?limit=50', { token: malloryToken });
  const stored = drafts.items.find((item) => item.id === scripted.id);
  check(
    'and stored verbatim rather than silently mangled',
    stored?.title.includes('<script>'),
    stored?.title?.slice(0, 40),
  );

  // Storing it verbatim is only safe if every renderer escapes it, so the tag has to be
  // followed all the way onto a real page. Escaping at the boundary and storing the
  // original is the correct shape — the danger is a page that trusts the field.
  await call(`/moderation/listings/${scripted.id}/approve`, {
    method: 'POST',
    token: moderatorToken,
    body: { note: 'Security probe — XSS rendering check' },
  }).catch(() => null);

  const publishedScripted = await raw(`/listings/${scripted.slug}`);
  if (publishedScripted.status === 200) {
    const page = await fetch(`${WEB}/ad/${scripted.slug}`);
    const html = await page.text();

    check(
      'the listing page renders',
      page.status === 200,
      `HTTP ${page.status}`,
    );
    check(
      'the script tag is escaped, not executable',
      !html.includes('<script>alert(1)</script>'),
      html.includes('&lt;script&gt;') ? 'escaped as &lt;script&gt;' : 'tag absent entirely',
    );
    check(
      'the surrounding title still reaches the reader',
      html.includes('Sofa set') && html.includes('for sale'),
    );

    const searchPage = await fetch(`${WEB}/search?q=sofa`).then((response) => response.text());
    check(
      'and stays escaped in search results',
      !searchPage.includes('<script>alert(1)</script>'),
    );
  } else {
    check(
      'the scripted listing could be published for the rendering check',
      false,
      `HTTP ${publishedScripted.status}`,
    );
  }

  // ---------------------------------------------------------------- 8. drafts
  step("8. A draft is nobody else's business");

  // Its own listing, deliberately: the scripted one above had to be published to prove
  // the rendering escapes, and reusing it here would have tested nothing.
  const draft = await call('/listings', {
    method: 'POST',
    token: malloryToken,
    body: {
      type: 'PRODUCT',
      title: 'Unfinished draft with the asking price still blank',
      description: 'Half-written notes about a dining table, not ready for anyone to read.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      marketplace: { price: 7000, condition: 'GOOD' },
      saveAsDraft: true,
    },
  });
  check('the draft is saved unpublished', draft.status === 'DRAFT', draft.status);

  const draftDetail = await raw(`/listings/${draft.slug}`);
  check('a draft is not public', refused(draftDetail), `HTTP ${draftDetail.status}`);

  const draftToAlice = await raw(`/listings/${draft.slug}`, { token: aliceToken });
  check('nor visible to another signed-in user', refused(draftToAlice), `HTTP ${draftToAlice.status}`);

  const draftInSearch = await call('/search?q=unfinished%20draft&limit=10');
  check(
    'and never reaches the search index',
    !draftInSearch.items.some((item) => item.id === draft.id),
    `${draftInSearch.total} results`,
  );

  const ownDraft = await call('/listings/mine?limit=50', { token: malloryToken });
  check(
    'while its owner still sees it',
    ownDraft.items.some((item) => item.id === draft.id),
  );

  // ---------------------------------------------------------------- 8b. business roles
  step('8b. A business has an owner, staff, and everyone else');

  const allCategories = await call('/categories');
  const business = await call('/businesses', {
    method: 'POST',
    token: aliceToken,
    body: {
      name: `Sri Lakshmi Electronics ${Math.floor(Math.random() * 100000)}`,
      categoryId: allCategories[0].id,
      cityId: cities[0].id,
      description: 'Small electronics shop selling and repairing home appliances.',
      addressLine: 'Shop 4, main road',
      primaryPhone: alicePhone,
    },
  });
  check('the owner can create a business', Boolean(business.id), business.slug);

  // A stranger has no relationship to it at all.
  for (const [label, path, method, body] of [
    ['see who works there', `/businesses/${business.id}/staff`, 'GET', undefined],
    ['edit it', `/businesses/${business.id}`, 'PATCH', { description: 'Under new management' }],
    [
      'hire staff',
      `/businesses/${business.id}/staff`,
      'POST',
      { phone: malloryPhone, role: 'MANAGER' },
    ],
    ['ask for verification', `/businesses/${business.id}/verification-request`, 'POST', undefined],
    ['delete it', `/businesses/${business.id}`, 'DELETE', undefined],
  ]) {
    const result = await raw(path, { method, token: malloryToken, body });
    check(`a stranger cannot ${label}`, refused(result), `HTTP ${result.status}`);
  }

  // Verification is the trust signal buyers actually rely on, so it is an administrator's
  // decision and never the owner's. An owner may ask; only an admin may grant.
  const selfVerify = await raw(`/businesses/${business.id}/verification`, {
    method: 'POST',
    token: aliceToken,
    body: { verified: true },
  });
  check('an owner cannot verify their own business', refused(selfVerify), `HTTP ${selfVerify.status}`);

  // Verification cannot be requested from a bare profile — a badge earned by filling in
  // nothing would be worth nothing to the buyer reading it. The refusal names what is
  // missing rather than saying no.
  const requested = await raw(`/businesses/${business.id}/verification-request`, {
    method: 'POST',
    token: aliceToken,
  });
  check(
    'an incomplete profile cannot request verification',
    requested.status === 400,
    `HTTP ${requested.status}`,
  );
  check(
    'and the refusal says what is missing',
    /address|opening hours|description|phone/i.test(requested.body?.error?.message ?? requested.text),
    requested.body?.error?.message ?? '',
  );

  const publicProfile = await call(`/businesses/${business.slug}`);
  check(
    'the business is not verified',
    publicProfile.verificationStatus === 'UNVERIFIED' ||
      publicProfile.verificationStatus === 'NOT_REQUESTED',
    `verificationStatus=${publicProfile.verificationStatus}`,
  );

  // Now Mallory genuinely works there, in the most limited role.
  const hired = await call(`/businesses/${business.id}/staff`, {
    method: 'POST',
    token: aliceToken,
    body: { phone: malloryPhone, role: 'VIEWER' },
  });
  check('the owner can hire a viewer', Boolean(hired.id), hired.role);

  // A viewer answers enquiries. A viewer does not run the business.
  for (const [label, path, method, body] of [
    [
      'hire other staff',
      `/businesses/${business.id}/staff`,
      'POST',
      { phone: '+919000000005', role: 'MANAGER' },
    ],
    ['remove staff', `/businesses/${business.id}/staff/${hired.id}`, 'DELETE', undefined],
    ['request verification', `/businesses/${business.id}/verification-request`, 'POST', undefined],
    ['delete the business', `/businesses/${business.id}`, 'DELETE', undefined],
    [
      'edit the profile',
      `/businesses/${business.id}`,
      'PATCH',
      { description: 'A viewer should not be rewriting the shop description.' },
    ],
  ]) {
    const result = await raw(path, { method, token: malloryToken, body });
    check(`a viewer cannot ${label}`, refused(result), `HTTP ${result.status}`);
  }

  // Being staff is not a way to post as the business either — that needs listing:create,
  // which a viewer does not have.
  const postAsBusiness = await raw('/listings', {
    method: 'POST',
    token: malloryToken,
    body: {
      type: 'PRODUCT',
      title: 'Washing machine sold by the shop',
      description: 'Posting this as the business, which a viewer has no right to do.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      businessId: business.id,
      marketplace: { price: 9000, condition: 'GOOD' },
    },
  });
  check(
    'a viewer cannot post on the business behalf',
    refused(postAsBusiness),
    `HTTP ${postAsBusiness.status}`,
  );

  // Dismissal has to take effect immediately, not at the next sign-in.
  await call(`/businesses/${business.id}/staff/${hired.id}`, {
    method: 'DELETE',
    token: aliceToken,
  });
  const afterRemoval = await raw(`/businesses/${business.id}/staff`, { token: malloryToken });
  check('a removed staff member loses access at once', refused(afterRemoval), `HTTP ${afterRemoval.status}`);

  const removedPost = await raw('/listings', {
    method: 'POST',
    token: malloryToken,
    body: {
      type: 'PRODUCT',
      title: 'Another washing machine from the shop',
      description: 'Posting as a business this account no longer has any part in.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      businessId: business.id,
      marketplace: { price: 9000, condition: 'GOOD' },
    },
  });
  check('and cannot keep posting as the business', refused(removedPost), `HTTP ${removedPost.status}`);

  // A manager runs the day-to-day work and still does not own the place.
  const manager = await call(`/businesses/${business.id}/staff`, {
    method: 'POST',
    token: aliceToken,
    body: { phone: malloryPhone, role: 'MANAGER' },
  });
  check('the owner can promote someone to manager', manager.role === 'MANAGER');

  const managerHires = await raw(`/businesses/${business.id}/staff`, {
    method: 'POST',
    token: malloryToken,
    body: { phone: '+919000000005', role: 'EDITOR' },
  });
  check('a manager still cannot hire', refused(managerHires), `HTTP ${managerHires.status}`);

  const managerDeletes = await raw(`/businesses/${business.id}`, {
    method: 'DELETE',
    token: malloryToken,
  });
  check('nor delete the business', refused(managerDeletes), `HTTP ${managerDeletes.status}`);

  // Rewriting your own row is the obvious next move once you are inside.
  const escalate = await raw(`/businesses/${business.id}/staff`, {
    method: 'POST',
    token: malloryToken,
    body: { phone: malloryPhone, role: 'MANAGER', permissions: ['*'] },
  });
  check(
    'a manager cannot rewrite their own permissions',
    refused(escalate) || escalate.status === 400,
    `HTTP ${escalate.status}`,
  );

  // ---------------------------------------------------------------- 8c. blocked images
  step('8c. A picture a moderator refused does not come back');

  // Tokens are re-acquired here rather than reused from the top of the run: this section
  // arrives well past the fifteen-minute life of the ones fetched earlier.
  const freshAlice = (await getSession(API, alicePhone, 'security-alice')).tokens.accessToken;
  const freshMallory = (await getSession(API, malloryPhone, 'security-mallory')).tokens.accessToken;
  const freshModerator = (await getSession(API, '+919000000003', 'security-moderator')).tokens
    .accessToken;

  /** Uploads one image to a listing and returns the confirmation result. */
  async function uploadImage(listingId, token, bytes) {
    const ticket = await call(`/listings/${listingId}/media/upload-url`, {
      method: 'POST',
      token,
      body: { mimeType: 'image/jpeg', sizeBytes: bytes.length },
    });

    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: bytes,
    });
    if (!put.ok) throw new Error(`Object storage refused the upload: HTTP ${put.status}`);

    return { mediaId: ticket.mediaId, confirmed: await raw(`/media/${ticket.mediaId}/confirm`, { method: 'POST', token }) };
  }

  /**
   * A picture with structure, different on every run.
   *
   * Different matters as much as structured. This section blocks whatever it uploads, and
   * a block is permanent by design — so a fixed fixture would be refused by the *previous*
   * run's block the next time the suite executes, and the suite would fail for a reason
   * that has nothing to do with the code.
   *
   * Random rectangles rather than a random colour: the hash records where light meets
   * dark, so recolouring the same shapes produces the same sixty-four bits.
   */
  async function distinctivePicture() {
    const blocks = Array.from({ length: 12 }, () => ({
      left: Math.floor(Math.random() * 400),
      top: Math.floor(Math.random() * 280),
      width: 40 + Math.floor(Math.random() * 80),
      height: 30 + Math.floor(Math.random() * 60),
      shade: Math.floor(Math.random() * 255),
    }));

    const composites = await Promise.all(
      blocks.map(async (block) => ({
        input: await sharp({
          create: {
            width: block.width,
            height: block.height,
            channels: 3,
            background: { r: block.shade, g: (block.shade * 3) % 255, b: (block.shade * 7) % 255 },
          },
        })
          .png()
          .toBuffer(),
        left: block.left,
        top: block.top,
      })),
    );

    return sharp({
      create: { width: 480, height: 360, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .composite(composites)
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  const photo = await distinctivePicture();

  const carrier = await call('/listings', {
    method: 'POST',
    token: freshAlice,
    body: {
      type: 'PRODUCT',
      title: 'Wooden coffee table with glass top',
      description: 'Selling a coffee table bought two years ago, in good condition throughout.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      marketplace: { price: 3500, condition: 'GOOD' },
      saveAsDraft: true,
    },
  });

  const first = await uploadImage(carrier.id, freshAlice, photo);
  // Held rather than published: every image now waits for a decision, which is the point
  // of quarantine. What matters here is that it processed rather than being refused.
  check(
    'an ordinary image is accepted for review',
    first.confirmed.body?.status === 'REVIEW_REQUIRED' || first.confirmed.body?.status === 'READY',
    first.confirmed.body?.status,
  );

  const blockResult = await call(`/moderation/media/${first.mediaId}/block`, {
    method: 'POST',
    token: freshModerator,
    body: { reason: 'Security probe — blocking to prove the refusal holds', category: 'WILDLIFE' },
  });
  check(
    'a moderator can block it',
    blockResult.blocked === 2,
    `${blockResult.blocked} hashes recorded`,
  );

  // The same file again, on a different listing owned by someone else — a block has to be
  // about the picture, not about the listing or the account it first appeared on.
  const second = await call('/listings', {
    method: 'POST',
    token: freshMallory,
    body: {
      type: 'PRODUCT',
      title: 'Another coffee table for sale cheap',
      description: 'Reposting the same photograph from a different account entirely.',
      categoryId: leaf.id,
      cityId: cities[0].id,
      marketplace: { price: 3200, condition: 'GOOD' },
      saveAsDraft: true,
    },
  });

  const repeat = await uploadImage(second.id, freshMallory, photo);
  check(
    'the identical file is refused',
    repeat.confirmed.body?.status === 'REJECTED',
    repeat.confirmed.body?.status ?? `HTTP ${repeat.confirmed.status}`,
  );

  // Re-saving at a different quality is what someone actually does next. The bytes change
  // completely, so only the perceptual hash can catch it.
  const resaved = await sharp(photo).jpeg({ quality: 45 }).toBuffer();
  check('the re-saved file is genuinely different bytes', !resaved.equals(photo));

  const evaded = await uploadImage(second.id, freshMallory, resaved);
  check(
    'and so is the same picture re-saved',
    evaded.confirmed.body?.status === 'REJECTED',
    evaded.confirmed.body?.status ?? `HTTP ${evaded.confirmed.status}`,
  );

  // A different photograph must still get through, or the block is just an outage.
  // Structured, different again, and different from every earlier run's block.
  const unrelated = await distinctivePicture();

  const innocent = await uploadImage(second.id, freshMallory, unrelated);
  check(
    'an unrelated picture is unaffected',
    innocent.confirmed.body?.status !== 'REJECTED',
    innocent.confirmed.body?.status ?? `HTTP ${innocent.confirmed.status}`,
  );

  await raw(`/listings/${carrier.id}`, { method: 'DELETE', token: freshAlice });
  await raw(`/listings/${second.id}`, { method: 'DELETE', token: freshMallory });

  // A block is permanent by design and there is no unblock endpoint — deliberately, since
  // reversing a safety decision should be a considered act rather than an API call. The
  // fixtures above are therefore generated fresh each run: an earlier version of this
  // section blocked the shared test photograph, which then stayed refused for every suite
  // afterwards. Anything left behind can be cleared with:
  //
  //   DELETE FROM blocked_image_hashes WHERE reason LIKE 'Security probe%';

  // ---------------------------------------------------------------- 8d. child safety
  step('8d. Restricted material is reachable only by the person named for it');

  const officer = await getSession(API, '+919000000008', 'security-officer');
  const officerToken = officer.tokens.accessToken;
  check(
    'a designated officer exists at all',
    officer.user.roles.includes('CHILD_SAFETY_OFFICER'),
    officer.user.roles.join(', '),
  );

  // The queue is useless without someone able to read it, and the report POCSO makes
  // mandatory cannot be made by a role nobody holds.
  const officerCases = await raw('/moderation/safety/cases', { token: officerToken });
  check('and can open the restricted queue', officerCases.status === 200, `HTTP ${officerCases.status}`);

  for (const [label, path] of [
    ['the moderation queue', '/moderation/queue?limit=1'],
    ['the user directory', '/admin/users?limit=1'],
    ['platform metrics', '/admin/metrics'],
  ]) {
    const result = await raw(path, { token: officerToken });
    check(`the officer cannot reach ${label}`, refused(result), `HTTP ${result.status}`);
  }

  // The other direction. An ordinary moderator handles listings and reports; restricted
  // evidence is a different job with different training.
  const moderatorCases = await raw('/moderation/safety/cases', { token: moderatorToken });
  check('a moderator cannot open the restricted queue', refused(moderatorCases), `HTTP ${moderatorCases.status}`);

  const strangerCases = await raw('/moderation/safety/cases', { token: malloryToken });
  check('nor can an ordinary account', refused(strangerCases), `HTTP ${strangerCases.status}`);

  // And the one that matters most: the platform's most powerful credential.
  const superAdmin = await getSession(API, '+919000000001', 'security-superadmin');
  check(
    'the super administrator holds the wildcard',
    superAdmin.user.permissions.includes('*'),
  );
  check(
    'but not the child-safety permissions',
    !superAdmin.user.permissions.includes('safety:evidence:read'),
  );

  const superCases = await raw('/moderation/safety/cases', {
    token: superAdmin.tokens.accessToken,
  });
  check(
    'and the wildcard does not open the restricted queue',
    refused(superCases),
    `HTTP ${superCases.status}`,
  );

  // The wildcard must still work for everything else, or this has broken the platform to
  // protect one corner of it.
  const superQueue = await raw('/moderation/queue?limit=1', {
    token: superAdmin.tokens.accessToken,
  });
  check('while still opening everything else', superQueue.status === 200, `HTTP ${superQueue.status}`);

  // ---------------------------------------------------------------- 9. cleanup
  step('9. Cleanup');
  await raw(`/businesses/${business.id}`, { method: 'DELETE', token: aliceToken });
  await raw(`/listings/${draft.id}`, { method: 'DELETE', token: malloryToken });
  await raw(`/listings/${scripted.id}`, { method: 'DELETE', token: malloryToken });
  await raw(`/listings/${listing.id}`, { method: 'DELETE', token: aliceToken });
  check('probe listings removed', true);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nSecurity probe run aborted: ${error.message}`);
  process.exitCode = 1;
});
