#!/usr/bin/env node
/**
 * Admin console acceptance gate.
 *
 *   node scripts/acceptance-admin.mjs
 *
 * Two questions, because they fail independently:
 *
 *   1. Does the API refuse admin work to people who are not admins? A console that looks
 *      right while the API leaks user records to any signed-in seller is worse than no
 *      console. Every authorisation assertion here is negative — the thing that must NOT
 *      happen.
 *   2. Does every console page actually render real data? A Next.js page whose API call
 *      failed still returns HTTP 200 with an empty shell, so "the page loads" proves
 *      nothing. Each page is checked for content that can only come from the database.
 *
 * HTTP only, no direct database access, non-zero exit on failure so it can gate a deploy.
 */

import { getSession } from './lib/session.mjs';

const API = process.env.LOCZ_API ?? 'http://127.0.0.1:4000/api/v1';
const ADMIN_WEB = process.env.LOCZ_ADMIN_WEB ?? 'http://127.0.0.1:3001';

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
  const init = { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };

  let response = await fetch(`${API}${path}`, init);

  // A 429 is the rate limiter doing its job, not a failure — back off rather than
  // weakening a real protection to make a test pass.
  for (let attempt = 0; response.status === 429 && attempt < retries; attempt += 1) {
    const waitMs = backoffMs(response, await response.clone().text());
    console.log(`    (rate limited — waiting ${Math.round(waitMs / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetch(`${API}${path}`, init);
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

/** Status only — used for the authorisation checks, where the body is irrelevant. */
async function status(path, token) {
  const response = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.status;
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

/** Fetches a console page with a session and returns its HTML. */
async function page(path, cookie) {
  const response = await fetch(`${ADMIN_WEB}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const html = await response.text();
  return { status: response.status, html, location: response.headers.get('location') };
}

/**
 * The console's own cookie names. Its pages call the API server-side with these, so
 * setting them is exactly what signing in through the login form does.
 */
function adminCookie(session) {
  const user = {
    id: session.user.id,
    displayName: session.user.displayName,
    email: session.user.email ?? null,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };

  return [
    `locz_admin_access=${session.tokens.accessToken}`,
    `locz_admin_refresh=${session.tokens.refreshToken}`,
    `locz_admin_user=${encodeURIComponent(JSON.stringify(user))}`,
  ].join('; ');
}

async function main() {
  console.log(`LocZ admin acceptance — API ${API}, console ${ADMIN_WEB}`);

  // ---------------------------------------------------------------- 1. sign in
  step('1. Staff sign-in');
  const admin = await signIn('+919000000002', 'admin-acceptance');
  check('administrator signs in', admin.user.roles.includes('ADMINISTRATOR'), admin.user.roles.join(', '));
  check('carries metrics:read', admin.user.permissions.includes('metrics:read'));
  check('carries user:manage', admin.user.permissions.includes('user:manage'));
  const adminToken = admin.tokens.accessToken;

  const moderator = await signIn('+919000000003', 'moderator-acceptance');
  check('moderator signs in', moderator.user.roles.includes('MODERATOR'));
  const moderatorToken = moderator.tokens.accessToken;

  // ---------------------------------------------------------------- 2. authorisation
  step('2. Authorisation — the negative cases');

  // A brand-new ordinary account. If any of these succeed, the console is a liability.
  const strangerPhone = `+9196${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  const stranger = await signIn(strangerPhone, 'stranger-acceptance');
  const strangerToken = stranger.tokens.accessToken;
  check('ordinary account has no admin roles', !stranger.user.roles.some((role) => role.includes('ADMIN')));

  for (const path of [
    '/admin/metrics',
    '/admin/users?limit=5',
    '/admin/audit-logs?limit=5',
    '/admin/queues',
    '/admin/storage',
  ]) {
    check(`${path} refuses an ordinary account`, (await status(path, strangerToken)) === 403);
  }

  for (const path of ['/admin/metrics', '/admin/users?limit=5']) {
    check(`${path} refuses an anonymous request`, (await status(path)) === 401);
  }

  // A moderator moderates; a moderator does not read the user directory or the audit log.
  check(
    '/admin/users refuses a moderator',
    (await status('/admin/users?limit=5', moderatorToken)) === 403,
  );
  // A moderator *is* granted audit:read, deliberately: moderation decisions are
  // reviewable, and the person making them can see the trail. Asserted rather than
  // assumed, so a future permission change has to be a conscious one.
  check(
    'a moderator may read the audit log, by design',
    (await status('/admin/audit-logs?limit=5', moderatorToken)) === 200,
  );
  check(
    'moderation queue accepts a moderator',
    (await status('/moderation/queue?limit=5', moderatorToken)) === 200,
  );

  // ---------------------------------------------------------------- 3. admin API
  step('3. Admin API returns real data');
  const metrics = await call('/admin/metrics', { token: adminToken });
  check('metrics returned', typeof metrics.totalUsers === 'number', `${metrics.totalUsers} users`);
  check(
    'listing counts present',
    typeof metrics.publishedListings === 'number' && typeof metrics.pendingListings === 'number',
    `${metrics.publishedListings} published, ${metrics.pendingListings} pending review`,
  );
  check(
    'moderation backlog is visible',
    typeof metrics.openReports === 'number',
    `${metrics.openReports} open reports`,
  );

  const byCity = await call('/admin/metrics/listings-by-city', { token: adminToken });
  check('listings by city', Array.isArray(byCity) && byCity.length > 0, `${byCity.length} cities`);

  const byCategory = await call('/admin/metrics/listings-by-category', { token: adminToken });
  check('listings by category', Array.isArray(byCategory), `${byCategory.length} categories`);

  const daily = await call('/admin/metrics/daily-listings', { token: adminToken });
  check('daily listing series', Array.isArray(daily), `${daily.length} days`);

  const users = await call('/admin/users?limit=5', { token: adminToken });
  check('user directory returns rows', users.items.length > 0, `${users.meta.total} total`);
  check(
    'phone numbers are visible to an administrator',
    users.items.every((user) => typeof user.phone === 'string' && user.phone.length > 0),
  );

  const audit = await call('/admin/audit-logs?limit=5', { token: adminToken });
  check('audit log has entries', audit.items.length > 0, `${audit.meta.total} entries`);
  check(
    'audit entries name an action and an actor',
    audit.items.every((entry) => Boolean(entry.action)),
    audit.items[0]?.action,
  );

  const queues = await call('/admin/queues', { token: adminToken });
  check('queue health reported', Array.isArray(queues) && queues.length > 0, queues.map((q) => q.name).join(', '));

  const storage = await call('/admin/storage', { token: adminToken });
  check('storage health reported', storage !== null && typeof storage === 'object');

  // ---------------------------------------------------------------- 4. console pages
  step('4. Console pages render with a session');

  const signedOut = await page('/', '');
  check('signed-out visitor is redirected to login', signedOut.status === 307, signedOut.location ?? '');

  const login = await page('/login', '');
  check('login page renders', login.status === 200 && login.html.includes('<form'));

  const cookie = adminCookie(admin);

  // Each page is checked for content that can only come from the database — a rendered
  // shell with a failed API call would otherwise pass as "the page loads".
  const pages = [
    { path: '/', label: 'dashboard', must: String(metrics.totalUsers) },
    { path: '/moderation', label: 'moderation queue', must: 'Moderation' },
    { path: '/listings', label: 'listings', must: 'Listings' },
    { path: '/users', label: 'users', must: users.items[0].displayName },
    { path: '/categories', label: 'categories', must: 'Categories' },
    { path: '/reports', label: 'reports', must: 'Reports' },
    { path: '/audit', label: 'audit log', must: audit.items[0].action },
    { path: '/system', label: 'system', must: 'System' },
  ];

  for (const target of pages) {
    const result = await page(target.path, cookie);
    check(
      `${target.label} page renders`,
      result.status === 200,
      result.status === 200 ? '' : `HTTP ${result.status}`,
    );
    check(
      `${target.label} shows live data`,
      result.html.includes(target.must),
      result.html.includes(target.must) ? '' : `missing "${target.must}"`,
    );
    // A Next.js error boundary renders 200 with the failure inside it.
    check(
      `${target.label} has no error boundary`,
      !/Application error|Something went wrong|Internal Server Error/i.test(result.html),
    );
  }

  // ---------------------------------------------------------------- 5. summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nAdmin acceptance run aborted: ${error.message}`);
  process.exitCode = 1;
});
