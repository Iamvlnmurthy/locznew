#!/usr/bin/env node
/**
 * Focused browser gate for search correctness.
 *
 * This complements API relevance tests by proving that the current web response renders
 * honest zero- and one-result states. It creates one locally restricted public fixture and
 * removes it in finally, so the singular-result assertion never depends on seed data.
 */

import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import {
  CdpBrowser,
  api,
  cleanupPublicFixtures,
  createPublicFixtures,
  waitUntil,
} from './acceptance-browser.mjs';

const root = resolve(import.meta.dirname, '..');
dotenv.config({ path: resolve(root, '.env'), quiet: true });

const email = process.env.LOCZ_BROWSER_EMAIL ?? 'buyer@locz.test';
const password = process.env.LOCZ_BROWSER_PASSWORD ?? 'LocZ@dev1234';
let passed = 0;

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed += 1;
  console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
}

async function assertZeroResult(browser, query, label) {
  const apiResult = await api(`/search?q=${encodeURIComponent(query)}&limit=1`);
  check(
    `${label} has a zero-result API precondition`,
    apiResult.total === 0 && apiResult.items.length === 0,
    `total=${apiResult.total}`,
  );
  await browser.navigate(`/search?q=${encodeURIComponent(query)}`);
  await browser.waitFor(
    `document.querySelector('.search-page__hero h1')?.textContent?.startsWith('0 results for')`,
    `${label} zero-result heading`,
    20_000,
  );
  const state = await browser.evaluate(`(() => ({
    heading: document.querySelector('.search-page__hero h1')?.textContent?.trim(),
    localMatches: document.querySelector('.search-results__toolbar strong')?.textContent?.trim(),
    emptyTitle: document.querySelector('.search-empty h2')?.textContent?.trim(),
    cards: document.querySelectorAll('.listing-card').length,
  }))()`);
  check(
    `${label} renders an honest empty state`,
    state.heading === `0 results for “${query}”` &&
      state.localMatches === '0 local matches' &&
      state.emptyTitle === 'Nothing found' &&
      state.cards === 0,
    JSON.stringify(state),
  );
}

async function main() {
  console.log('LocZ focused search browser acceptance');
  const login = await api('/auth/login/email', {
    method: 'POST',
    body: {
      email,
      password,
      device: {
        deviceKey: `search-browser-${Date.now()}`,
        platform: 'WEB',
        name: 'Search browser acceptance',
      },
    },
  });
  const fixture = {};
  const browser = new CdpBrowser();

  try {
    await createPublicFixtures(login.tokens.accessToken, fixture);
    await browser.start();
    await browser.setSession(login);
    await browser.viewport(1365, 900);

    const uniqueTerm = fixture.listing.title.split(' ').at(-1);
    await waitUntil(
      async () => {
        const result = await api(`/search?q=${encodeURIComponent(uniqueTerm)}&limit=20`);
        return result.items.some((item) => item.id === fixture.listing.id);
      },
      'fixture visibility in the search index',
      20_000,
    );
    await browser.navigate(`/search?q=${encodeURIComponent(uniqueTerm)}`);
    await browser.waitFor(
      `Boolean(document.querySelector('a[href="/ad/${fixture.listing.slug}"]'))`,
      'deterministic one-result listing',
      20_000,
    );
    const singularState = await browser.evaluate(`(() => ({
      heading: document.querySelector('.search-page__hero h1')?.textContent?.trim(),
      localMatches: document.querySelector('.search-results__toolbar strong')?.textContent?.trim(),
      cards: document.querySelectorAll('.listing-card').length,
      target: Boolean(document.querySelector('a[href="/ad/${fixture.listing.slug}"]')),
    }))()`);
    check(
      'a deterministic single match renders singular copy and one card',
      singularState.heading === `1 result for “${uniqueTerm}”` &&
        singularState.localMatches === '1 local match' &&
        singularState.cards === 1 &&
        singularState.target,
      JSON.stringify(singularState),
    );

    await assertZeroResult(browser, 'car', 'irrelevant keyword');
    await assertZeroResult(browser, `zzqv${randomUUID().replaceAll('-', '')}`, 'nonsense keyword');

    check(
      'search journeys emit no browser or server runtime errors',
      browser.errors.length === 0 && browser.httpErrors.length === 0,
      [...browser.errors, ...browser.httpErrors].join(' | '),
    );
  } finally {
    await cleanupPublicFixtures(login.tokens.accessToken, fixture);
    browser.close();
  }

  console.log(`\n${passed} passed, 0 failed`);
}

main().catch((error) => {
  console.error(`\nFocused search browser acceptance failed: ${error.message}`);
  process.exitCode = 1;
});
