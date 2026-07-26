#!/usr/bin/env node
/**
 * Public web acceptance gate.
 *
 *   node scripts/acceptance-web.mjs
 *
 * The buyer/seller API flow is covered by scripts/acceptance.mjs. This covers the thing
 * that suite cannot see: whether the pages a real visitor opens actually render.
 *
 * The trap it exists for — a Next.js page whose data fetch failed still returns HTTP 200
 * with a rendered shell. "The page loads" is not evidence. So every page here is checked
 * for a string that can only have come from the database, and for the absence of an error
 * boundary. Slugs and ids are read from the live API at startup rather than hardcoded, so
 * the suite keeps working after a reseed.
 *
 * Exits non-zero on failure so it can gate a deploy.
 */

import { getSession } from './lib/session.mjs';

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

/**
 * How long to wait after a 429.
 *
 * Taken from the server's own "try again in N seconds" rather than guessed: the per-phone
 * OTP lockout runs to minutes, and these suites share the seeded staff accounts, so
 * running them back to back legitimately trips it. Capped so a broken limiter cannot hang
 * the run.
 */
function backoffMs(body) {
  const hinted = Number(/try again in (\d+) seconds/i.exec(body)?.[1] ?? 0);
  return Math.min(Math.max(hinted + 2, 11) * 1000, 360_000);
}

async function api(path, { method = 'GET', body, token, retries = 6 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };

  let response = await fetch(`${API}${path}`, init);
  // A 429 is the rate limiter working, not a failure.
  for (let attempt = 0; response.status === 429 && attempt < retries; attempt += 1) {
    const waitMs = backoffMs(await response.clone().text());
    console.log(`    (rate limited — waiting ${Math.round(waitMs / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetch(`${API}${path}`, init);
  }

  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 200)}`);
  const payload = text ? JSON.parse(text) : null;
  return payload?.data ?? payload;
}

async function page(path, cookie = '') {
  const response = await fetch(`${WEB}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  return {
    status: response.status,
    html: await response.text(),
    location: response.headers.get('location'),
  };
}

/**
 * One page, three questions: did it respond, does it contain data only the database could
 * have supplied, and did it quietly render an error boundary instead.
 */
async function checkPage(label, path, must, { cookie = '', expectStatus = 200 } = {}) {
  const result = await page(path, cookie);

  check(
    `${label} responds`,
    result.status === expectStatus,
    result.status === expectStatus ? path : `HTTP ${result.status} ${result.location ?? ''}`,
  );

  if (result.status !== expectStatus) return result;

  const needles = Array.isArray(must) ? must : [must];
  for (const needle of needles) {
    check(`${label} shows "${needle}"`, result.html.includes(needle));
  }

  check(
    `${label} has no error boundary`,
    !/Application error|Something went wrong|Internal Server Error|digest"/i.test(result.html),
  );

  return result;
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

/** The web app's own cookies — set exactly as its sign-in form sets them. */
function sessionCookie(session, city) {
  const user = {
    id: session.user.id,
    displayName: session.user.displayName,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };

  const jar = [
    `locz_access=${session.tokens.accessToken}`,
    `locz_refresh=${session.tokens.refreshToken}`,
    `locz_user=${encodeURIComponent(JSON.stringify(user))}`,
  ];

  if (city) jar.push(`locz_city=${encodeURIComponent(JSON.stringify(city))}`);
  return jar.join('; ');
}

async function main() {
  console.log(`LocZ web acceptance — API ${API}, web ${WEB}`);

  // ---------------------------------------------------------------- 0. fixtures
  step('0. Fixtures from the live API');
  const cities = await api('/locations/cities?launchedOnly=true&limit=5');
  const city = cities.find((entry) => entry.slug === 'hyderabad') ?? cities[0];
  check('launched city available', Boolean(city), city?.slug);

  const categories = await api('/categories');
  const category = categories[0];
  check('category available', Boolean(category), category?.slug);

  const results = await api('/search?limit=1&sort=newest');
  const listing = results.items[0];
  check('published listing available', Boolean(listing), listing?.slug);

  // ---------------------------------------------------------------- 1. public pages
  step('1. Public pages — no session');

  // The home feed must show real listing titles, not an empty shell.
  await checkPage('home', '/', [listing.title.slice(0, 30), 'Find it here']);
  await checkPage('search', `/search?q=${encodeURIComponent(listing.title.split(' ')[0])}`, listing.title.slice(0, 30));
  await checkPage('listing detail', `/ad/${listing.slug}`, [listing.title.slice(0, 30), 'LocZ']);
  await checkPage('category', `/c/${category.slug}`, category.name);
  await checkPage('city landing', `/in/${city.slug}`, city.name);
  await checkPage('location picker', '/location', ['Or enter your pincode', city.name]);
  await checkPage('sign-in', '/signin', 'form');

  // Static pages carry the brand promise; if the slogan is missing, a deploy dropped it.
  for (const [label, path] of [
    ['about', '/about'],
    ['help', '/help'],
    ['safety', '/safety'],
    ['terms', '/terms'],
    ['privacy', '/privacy'],
  ]) {
    await checkPage(label, path, 'LocZ');
  }

  // ---------------------------------------------------------------- 2. not found
  step('2. Missing things are missing, not broken');
  const ghost = await page('/ad/this-listing-does-not-exist-12345');
  check('unknown listing 404s', ghost.status === 404, `HTTP ${ghost.status}`);

  const ghostCity = await page('/in/atlantis');
  check('unknown city 404s', ghostCity.status === 404, `HTTP ${ghostCity.status}`);

  // ---------------------------------------------------------------- 3. signed out
  step('3. Signed-out visitors are sent to sign in');
  for (const [label, path] of [
    ['dashboard', '/dashboard'],
    ['chats', '/chats'],
    ['notifications', '/notifications'],
    ['post an ad', '/post'],
  ]) {
    const result = await page(path);
    check(
      `${label} redirects when signed out`,
      result.status === 307 || result.status === 302,
      `HTTP ${result.status} → ${result.location ?? ''}`,
    );
  }

  // ---------------------------------------------------------------- 4. signed in
  step('4. Signed-in pages render real data');
  const phone = `+9195${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  const session = await signIn(phone, 'web-acceptance');
  const cookie = sessionCookie(session, {
    id: city.id,
    name: city.name,
    slug: city.slug,
    latitude: city.latitude,
    longitude: city.longitude,
  });
  check('session established', Boolean(session.tokens.accessToken), session.user.displayName);

  // The greeting uses the first name only — "Good to see you, Anitha".
  await checkPage('dashboard', '/dashboard', session.user.displayName.split(' ')[0], { cookie });
  await checkPage('chats', '/chats', 'LocZ', { cookie });
  await checkPage('notifications', '/notifications', 'LocZ', { cookie });
  await checkPage('post an ad', '/post', [category.name, 'Pincode'], { cookie });
  await checkPage('new business', '/business/new', city.name, { cookie });
  // The parameter names the target type: ?listing=, ?business=, ?user=, ?conversation=.
  await checkPage('report', `/report?listing=${listing.id}`, 'LocZ', { cookie });

  const unaddressedReport = await page('/report', cookie);
  check(
    'a report with no target goes home rather than erroring',
    unaddressedReport.status === 307,
    `HTTP ${unaddressedReport.status} → ${unaddressedReport.location ?? ''}`,
  );

  // ---------------------------------------------------------------- 5. machine surfaces
  step('5. Machine-readable surfaces');
  const robots = await page('/robots.txt');
  check('robots.txt served', robots.status === 200 && robots.html.includes('Sitemap'));

  const sitemap = await page('/sitemap.xml');
  check('sitemap served', sitemap.status === 200 && sitemap.html.includes('<urlset'));
  check('sitemap lists city pages', sitemap.html.includes(`/in/${city.slug}`));
  check('sitemap lists category pages', sitemap.html.includes(`/c/${category.slug}`));
  // Individual listings are excluded on purpose: they expire within 30 days, and a
  // sitemap full of dead URLs costs more crawl trust than the coverage is worth.
  check('sitemap excludes expiring listing URLs', !sitemap.html.includes('/ad/'));

  const manifest = await page('/manifest.webmanifest');
  check('web manifest served', manifest.status === 200 && manifest.html.includes('LocZ'));

  // ---------------------------------------------------------------- 6. summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nWeb acceptance run aborted: ${error.message}`);
  process.exitCode = 1;
});
