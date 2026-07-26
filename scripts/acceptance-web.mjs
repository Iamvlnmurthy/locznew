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
function backoffMs(response, body) {
  // Retry-After is what the server actually promised; the sentence in the body is a
  // fallback for a build that predates the header.
  const header = Number(response?.headers?.get?.('retry-after') ?? 0);
  const hinted = Number(/try again in (\d+) seconds/i.exec(body ?? '')?.[1] ?? 0);
  const seconds = header > 0 ? header : hinted;
  return Math.min(Math.max(seconds + 2, 11) * 1000, 360_000);
}

async function api(path, { method = 'GET', body, token, retries = 6 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };

  let response = await fetch(`${API}${path}`, init);
  // A 429 is the rate limiter working, not a failure.
  for (let attempt = 0; response.status === 429 && attempt < retries; attempt += 1) {
    const waitMs = backoffMs(response, await response.clone().text());
    console.log(`    (rate limited — waiting ${Math.round(waitMs / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetch(`${API}${path}`, init);
  }

  const text = await response.text();
  if (!response.ok)
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 200)}`);
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
 * App Router control-flow can happen after the shared layout has started streaming. Once
 * headers are committed Next.js cannot change the transport status, so it emits the same
 * 404/redirect instruction in the React stream (and a meta refresh for redirects). Accept
 * either representation, but still require the exact destination for a redirect.
 */
function isNotFound(result) {
  return result.status === 404 || result.html.includes('NEXT_HTTP_ERROR_FALLBACK;404');
}

function redirectsTo(result, destination) {
  if (
    [301, 302, 303, 307, 308].includes(result.status) &&
    result.location === destination
  ) {
    return true;
  }

  const escapedDestination = destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    result.status === 200 &&
    result.html.includes('NEXT_REDIRECT') &&
    new RegExp(
      `http-equiv="refresh"[^>]+content="[^"]*url=${escapedDestination}"`,
      'i',
    ).test(result.html)
  );
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

  // Taken from the feed rather than from "newest": with fifty thousand listings the newest
  // one is not necessarily on the home page, and a fixture the page never shows would
  // make every assertion about it a false alarm.
  const feed = await api('/feed?limit=12');
  const fromFeed = feed.sections.flatMap((section) => section.items ?? []).find(Boolean);
  const results = await api('/search?limit=1&sort=newest');
  const listing = fromFeed ?? results.items[0];
  check('published listing available', Boolean(listing), listing?.slug);

  const businessDirectory = await api('/businesses?limit=12');
  const business = businessDirectory.items[0];
  check('active public business available', Boolean(business), business?.slug);

  // ---------------------------------------------------------------- 1. public pages
  step('1. Public pages — no session');

  // The home feed must show real listing titles, not an empty shell.
  await checkPage('home', '/', [listing.title.slice(0, 30), 'Find it here']);
  await checkPage(
    'search',
    `/search?q=${encodeURIComponent(listing.title.split(' ')[0])}`,
    listing.title.slice(0, 30),
  );
  await checkPage('listing detail', `/ad/${listing.slug}`, [listing.title.slice(0, 30), 'LocZ']);
  await checkPage('category', `/c/${category.slug}`, category.name);
  await checkPage('city landing', `/in/${city.slug}`, city.name);
  await checkPage('location picker', '/location', ['Or enter your pincode', city.name]);
  await checkPage('sign-in', '/signin', 'form');
  await checkPage(
    'business directory',
    `/business?q=${encodeURIComponent(business.name.split(' ')[0])}`,
    [business.name, `/b/${business.slug}`],
  );
  await checkPage('business profile', `/b/${business.slug}`, business.name);

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

  // ---------------------------------------------------------------- 1b. filters
  step('1b. Filters actually filter');

  const businessByName = await api(
    `/businesses?q=${encodeURIComponent(business.name.split(' ')[0])}&limit=12`,
  );
  check(
    'business name search returns the matching profile',
    businessByName.items.some((item) => item.id === business.id),
    `${businessByName.meta.total} matches`,
  );

  // Looked up by name rather than found in the list above. Every district in India is now
  // a place — 638 of them — so a business can easily belong to a city that a five-row
  // fetch never contained.
  const directoryCity =
    cities.find((entry) => entry.name === business.cityName) ??
    (await api(`/locations/cities?q=${encodeURIComponent(business.cityName)}&limit=1`))[0];
  const flatCategories = (list) =>
    list.flatMap((entry) => [entry, ...flatCategories(entry.children ?? [])]);
  const directoryCategory = flatCategories(categories).find(
    (entry) => entry.name === business.categoryName,
  );

  const businessByCity = await api(`/businesses?cityId=${directoryCity.id}&limit=12`);
  check(
    'business city filter returns only that city',
    businessByCity.items.length > 0 &&
      businessByCity.items.every((item) => item.cityName === business.cityName),
    business.cityName,
  );

  const businessByCategory = await api(`/businesses?categoryId=${directoryCategory.id}&limit=12`);
  check(
    'business category filter returns only that category',
    businessByCategory.items.length > 0 &&
      businessByCategory.items.every((item) => item.categoryName === business.categoryName),
    business.categoryName,
  );

  const impossibleBusiness = await api('/businesses?q=locz-no-such-business-9f8c4a&limit=12');
  check(
    'business text filter excludes non-matches with an honest total',
    impossibleBusiness.items.length === 0 && impossibleBusiness.meta.total === 0,
  );

  const verifiedBusinesses = await api('/businesses?verifiedOnly=true&limit=50');
  check(
    'verified-only directory contains no unverified profiles',
    verifiedBusinesses.items.every((item) => item.verificationStatus === 'VERIFIED'),
    `${verifiedBusinesses.meta.total} verified`,
  );

  const popularBusinesses = await api('/businesses?sort=popular&limit=50');
  check(
    'popular business order follows profile views',
    popularBusinesses.items.every(
      (item, index) =>
        index === 0 || popularBusinesses.items[index - 1].viewCount >= item.viewCount,
    ),
    popularBusinesses.items.map((item) => item.viewCount).join(' ≥ '),
  );

  /**
   * The search page and the API must agree, exactly.
   *
   * A redesign can leave a filter chip that renders, reads correctly and changes the URL
   * without ever reaching the query — and the page still looks right, because it shows
   * results. Comparing the rendered listing links against what the API returns for the
   * same parameters is the only check that can tell those apart.
   */
  async function agreesWithApi(label, query) {
    const rendered = await page(`/search?${query}`);
    const shown = [
      ...new Set(
        [...rendered.html.matchAll(/href="\/ad\/([a-z0-9-]+)"/g)].map((match) => match[1]),
      ),
    ];

    const expected = await api(`/search?${query}&limit=24`);
    const expectedSlugs = expected.items.map((item) => item.slug);

    const missing = expectedSlugs.filter((slug) => !shown.includes(slug));
    const extra = [...new Set(shown)].filter((slug) => !expectedSlugs.includes(slug));
    const exactOrder =
      shown.length === expectedSlugs.length &&
      shown.every((slug, index) => slug === expectedSlugs[index]);

    check(
      `${label} — page matches the API`,
      missing.length === 0 && extra.length === 0 && exactOrder,
      missing.length || extra.length
        ? `${missing.length} missing, ${extra.length} unexpected (API returned ${expectedSlugs.length})`
        : exactOrder
          ? `${expectedSlugs.length} results in exact order`
          : 'the result set matches, but its order does not',
    );

    return expected;
  }

  const unfiltered = await api('/search?limit=24');

  // Each filter has to actually narrow the set, or the assertion above is satisfied by
  // two things being equally wrong.
  const cheap = await agreesWithApi('price ceiling', 'priceMax=20000');
  check(
    'the price ceiling excludes dearer listings',
    cheap.items.every((item) => item.price === null || item.price <= 20000),
    `${cheap.total} of ${unfiltered.total} under ₹20,000`,
  );

  const good = await agreesWithApi('condition', 'condition=GOOD');
  const goodDetails = await Promise.all(
    good.items.map((item) => api(`/listings/${encodeURIComponent(item.slug)}`)),
  );
  check(
    'condition returns only matching marketplace details',
    goodDetails.length > 0 && goodDetails.every((item) => item.marketplace?.condition === 'GOOD'),
    `${good.total} in good condition`,
  );

  const products = await agreesWithApi('listing type', 'type=PRODUCT');
  check(
    'type narrows the set to products',
    products.items.every((item) => item.type === 'PRODUCT'),
    `${products.total} products`,
  );

  await agreesWithApi('pincode', 'pincode=500081');
  await agreesWithApi('sorted by price', 'sort=price_asc');

  const nearbyCheap = await agreesWithApi(
    'pincode plus price ceiling',
    'pincode=500081&priceMax=5000',
  );
  check(
    'a nearby price ceiling excludes dearer and unpriced listings',
    nearbyCheap.items.every((item) => item.price !== null && item.price <= 5000),
    nearbyCheap.items.map((item) => item.price ?? 'unpriced').join(', '),
  );

  const nearbyJobs = await agreesWithApi('pincode plus type', 'pincode=500081&type=JOB');
  check(
    'a nearby type filter returns only that type',
    nearbyJobs.items.every((item) => item.type === 'JOB'),
    `${nearbyJobs.items.length} shown of ${nearbyJobs.total} matching`,
  );
  // `total` counts everything that matches; the page holds at most `limit`. Requiring the
  // two to be equal only held while the database was small enough for one page to be the
  // whole answer — on a loaded one it asserts that pagination does not exist.
  check(
    'and a total that is at least the page it filled',
    nearbyJobs.total >= nearbyJobs.items.length,
    `${nearbyJobs.items.length} of ${nearbyJobs.total}`,
  );

  const nearbyGood = await agreesWithApi('pincode plus condition', 'pincode=500081&condition=GOOD');
  const nearbyGoodDetails = await Promise.all(
    nearbyGood.items.map((item) => api(`/listings/${encodeURIComponent(item.slug)}`)),
  );
  check(
    'a nearby condition filter returns only matching details',
    nearbyGoodDetails.length > 0 &&
      nearbyGoodDetails.every((item) => item.marketplace?.condition === 'GOOD'),
    `${nearbyGood.items.length} shown of ${nearbyGood.total}`,
  );

  const nearbyAscending = await agreesWithApi(
    'pincode plus price order',
    'pincode=500081&sort=price_asc',
  );
  const nearbyPrices = nearbyAscending.items
    .map((item) => item.price)
    .filter((price) => price !== null);
  check(
    'nearby price sort is actually ordered',
    nearbyPrices.every((price, index) => index === 0 || nearbyPrices[index - 1] <= price),
    nearbyPrices.slice(0, 4).join(' ≤ '),
  );

  // Featured placement used to prefix every ordering, so "price: low to high" opened with
  // a ₹32,900 phone above a ₹4,500 table. A paid boost may break a tie; it may not answer
  // a different question from the one the user asked.
  const ascending = await api('/search?sort=price_asc&limit=24');
  const prices = ascending.items.map((item) => item.price).filter((price) => price !== null);
  check(
    'price sort is actually ordered',
    prices.every((price, index) => index === 0 || prices[index - 1] <= price),
    prices.slice(0, 4).join(' ≤ '),
  );

  const descending = await api('/search?sort=price_desc&limit=24');
  const descPrices = descending.items.map((item) => item.price);
  const firstUnpriced = descPrices.indexOf(null);
  check(
    'the highest price leads, not the listings that have none',
    descPrices[0] !== null &&
      (firstUnpriced === -1 || descPrices.slice(firstUnpriced).every((price) => price === null)),
    `${descPrices[0]} first`,
  );

  // The default view is where featured placement belongs: no question was asked, so a
  // boost costs the user nothing.
  const defaultOrder = await api('/search?limit=24');
  check(
    'featured listings still lead the default view',
    defaultOrder.items[0]?.isFeatured === true,
    defaultOrder.items[0]?.slug,
  );

  // A filter matching nothing must say so rather than quietly showing everything — the
  // failure that turns a precise search into a wall of irrelevant results.
  const impossible = await api('/search?priceMax=1&type=PRODUCT&limit=24');
  const emptyPage = await page('/search?priceMax=1&type=PRODUCT');
  const emptyShown = [...emptyPage.html.matchAll(/href="\/ad\/([a-z0-9-]+)"/g)];
  check(
    'an impossible filter returns nothing, not everything',
    impossible.total === 0 && emptyShown.length === 0,
    `${impossible.total} results, ${emptyShown.length} cards rendered`,
  );

  // ---------------------------------------------------------------- 2. not found
  step('2. Missing things are missing, not broken');
  const ghost = await page('/ad/this-listing-does-not-exist-12345');
  check('unknown listing 404s', isNotFound(ghost), `HTTP ${ghost.status}`);

  const ghostCity = await page('/in/atlantis');
  check('unknown city 404s', isNotFound(ghostCity), `HTTP ${ghostCity.status}`);

  // ---------------------------------------------------------------- 3. signed out
  step('3. Signed-out visitors are sent to sign in');
  for (const [label, path] of [
    ['dashboard', '/dashboard'],
    ['chats', '/chats'],
    ['notifications', '/notifications'],
    ['post an ad', '/post'],
  ]) {
    const result = await page(path);
    const destination = `/signin?next=${encodeURIComponent(path)}`;
    check(
      `${label} redirects when signed out`,
      redirectsTo(result, destination),
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
    redirectsTo(unaddressedReport, '/'),
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
