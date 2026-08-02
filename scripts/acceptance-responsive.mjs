#!/usr/bin/env node
/**
 * Responsive route acceptance gate.
 *
 * Loads every major web surface with real API-backed routes, then checks the four
 * product breakpoints without reloading between widths. Dynamic fixtures are local,
 * clearly named and removed even when a check fails.
 */

import {
  CdpBrowser,
  api,
  cleanupPublicFixtures,
  createPublicFixtures,
  waitUntil,
} from './acceptance-browser.mjs';

const EMAIL = process.env.LOCZ_BROWSER_EMAIL ?? 'buyer@locz.test';
const PASSWORD = process.env.LOCZ_BROWSER_PASSWORD ?? 'LocZ@dev1234';
const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
];

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
    return;
  }
  failed += 1;
  failures.push(label);
  console.log(`  ✗ ${label}${detail ? `  ${detail}` : ''}`);
}

function flattenCategories(categories) {
  return categories.flatMap((category) => [
    category,
    ...flattenCategories(category.children ?? []),
  ]);
}

async function auditRoute(browser, label, path) {
  console.log(`\n${label} — ${path}`);
  await browser.navigate(path);

  for (const viewport of viewports) {
    await browser.viewport(viewport.width, viewport.height);
    const state = JSON.parse(
      await browser.evaluate(`JSON.stringify({
        contentLength: document.body.innerText.trim().length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        overlay: Boolean(document.querySelector(
          '[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay'
        )),
      })`),
    );

    check(
      `${label} renders at ${viewport.width}px`,
      state.contentLength > 20 && !state.overlay && !state.overflow,
      state.overlay
        ? 'framework error overlay'
        : state.overflow
          ? `${state.scrollWidth}px content in ${state.clientWidth}px viewport`
          : `${state.contentLength} characters`,
    );
  }
}

async function main() {
  console.log('LocZ responsive acceptance — 390 / 768 / 1024 / 1440');

  const login = await api('/auth/login/email', {
    method: 'POST',
    body: {
      email: EMAIL,
      password: PASSWORD,
      device: {
        deviceKey: `responsive-browser-${Date.now()}`,
        platform: 'WEB',
        name: 'Responsive route acceptance',
      },
    },
  });
  const token = login.tokens.accessToken;
  const fixture = {};
  const browser = new CdpBrowser();
  let managedBusiness;

  try {
    await createPublicFixtures(token, fixture);

    const [cities, categories] = await Promise.all([
      api('/locations/cities?launchedOnly=true&limit=10'),
      api('/categories'),
    ]);
    const city = cities.find((item) => item.slug === 'hyderabad') ?? cities[0];
    const flatCategories = flattenCategories(categories);
    const publicCategory =
      categories.find((item) => item.slug && item.listingTypes?.length > 0) ?? categories[0];
    const businessCategory =
      flatCategories.find((item) => item.listingTypes?.includes('BUSINESS_LISTING')) ??
      flatCategories[0];

    managedBusiness = await api('/businesses', {
      method: 'POST',
      token,
      body: {
        name: `Responsive Fixture Studio ${Date.now()}`,
        categoryId: businessCategory.id,
        cityId: city.id,
        description: 'A reversible business used only for responsive route verification.',
        addressLine: 'Responsive Acceptance Lane',
        primaryPhone: '+919876543210',
      },
    });

    await browser.start();
    const publicRoutes = [
      ['Home', '/'],
      ['Search', '/search'],
      ['Listing detail', `/ad/${fixture.listing.slug}`],
      ['Category', `/c/${publicCategory.slug}`],
      ['City landing', `/in/${city.slug}`],
      ['Location picker', '/location'],
      ['Sign in', '/signin'],
      ['Register', '/register'],
      ['Business directory', `/business?q=${encodeURIComponent(fixture.business.name)}`],
      ['Business profile', `/b/${fixture.business.slug}`],
      ['About', '/about'],
      ['Help', '/help'],
      ['Get app', '/get-app'],
      ['Safety', '/safety'],
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
    ];

    for (const route of publicRoutes) await auditRoute(browser, ...route);

    const impossibleTerm = `locz-no-match-${Date.now()}`;
    await auditRoute(browser, 'Zero-result search', `/search?q=${impossibleTerm}`);
    check(
      'zero-result search renders its deliberate empty state',
      await browser.evaluate(`Boolean(document.querySelector('.search-empty'))`),
    );

    const uniqueListingTerm = fixture.listing.title.split(' ').at(-1);
    await waitUntil(
      async () => {
        const result = await api(`/search?q=${encodeURIComponent(uniqueListingTerm)}&limit=24`);
        return result.total === 1 && result.items[0]?.id === fixture.listing.id;
      },
      'unique listing in search index',
      20_000,
    );
    await auditRoute(
      browser,
      'One-result search',
      `/search?q=${encodeURIComponent(uniqueListingTerm)}`,
    );
    check(
      'one-result search renders the sparse editorial state',
      await browser.evaluate(
        `document.querySelectorAll('.listing-card').length === 1 &&
         Boolean(document.querySelector('.search-results--sparse .listing-card--wide'))`,
      ),
    );

    await auditRoute(browser, 'Many-result search', '/search?type=PRODUCT');
    check(
      'many-result search keeps the dense result grid',
      await browser.evaluate(
        `document.querySelectorAll('.listing-card').length > 2 &&
         !document.querySelector('.search-results--sparse')`,
      ),
    );

    await auditRoute(browser, 'Not found', '/ad/this-responsive-listing-does-not-exist');
    check(
      'unknown listing renders the designed not-found state',
      await browser.evaluate(`Boolean(document.querySelector('.not-found'))`),
    );
    // Chrome logs the intentionally requested 404 document as a failed resource. It is
    // the state this assertion asked for, not a runtime error on the routes that follow.
    browser.clearErrors();

    for (const locale of ['te', 'hi']) {
      await browser.setLocale(locale);
      await auditRoute(browser, `${locale} search`, '/search?type=PRODUCT');
      await auditRoute(browser, `${locale} location`, '/location');
      await auditRoute(browser, `${locale} sign in`, '/signin');
      await auditRoute(browser, `${locale} register`, '/register');
    }

    await browser.setSession(login);
    const authenticatedRoutes = [
      ['Dashboard', '/dashboard'],
      ['Chats', '/chats'],
      ['Notifications', '/notifications'],
      ['Post listing', '/post'],
      ['New business', '/business/new'],
      ['Manage business', `/business/manage/${managedBusiness.id}`],
      ['Report listing', `/report?listing=${fixture.listing.id}`],
    ];

    const conversations = await api('/conversations?limit=1', { token });
    const conversation = conversations.items?.[0];
    if (conversation) {
      authenticatedRoutes.push(['Conversation', `/chats/${conversation.id}`]);
    }

    for (const route of authenticatedRoutes) await auditRoute(browser, ...route);

    check(
      'browser emitted no runtime errors',
      browser.errors.length === 0 && browser.httpErrors.length === 0,
      [...browser.errors, ...browser.httpErrors].join(' | '),
    );
  } finally {
    browser.close();
    if (managedBusiness?.id) {
      await api(`/businesses/${managedBusiness.id}`, { method: 'DELETE', token }).catch(
        () => undefined,
      );
    }
    await cleanupPublicFixtures(token, fixture);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nResponsive acceptance aborted: ${error.message}`);
  process.exitCode = 1;
});
