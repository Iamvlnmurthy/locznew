#!/usr/bin/env node
/**
 * Focused localized browser story with self-contained public fixtures.
 *
 * This is intentionally distinct from the broad acceptance-browser gate: it proves the
 * fixture boundary and the localized directory → listing → gallery → enquiry journey
 * without re-running unrelated checks whose shared-data variants have already run twice.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import {
  CdpBrowser,
  api,
  cleanupPublicFixtures,
  createPublicFixtures,
} from './acceptance-browser.mjs';

const root = resolve(import.meta.dirname, '..');
dotenv.config({ path: resolve(root, '.env'), quiet: true });

const messages = Object.fromEntries(
  ['te', 'hi'].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(
        resolve(root, 'apps', 'web', 'src', 'i18n', 'messages', `${locale}.json`),
        'utf8',
      ),
    ),
  ]),
);
const email = process.env.LOCZ_BROWSER_EMAIL ?? 'buyer@locz.test';
const fixtureOwnerEmail = process.env.LOCZ_BROWSER_FIXTURE_OWNER_EMAIL ?? 'seller@locz.test';
const password = process.env.LOCZ_BROWSER_PASSWORD ?? 'LocZ@dev1234';
let passed = 0;

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed += 1;
  console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
}

async function assertAccessible(browser, label) {
  const violations = await browser.accessibilityViolations();
  check(
    label,
    violations.length === 0,
    violations
      .map(
        (violation) =>
          `${violation.id}${violation.targets.length ? ` (${violation.targets.join(', ')})` : ''}`,
      )
      .join(', '),
  );
}

async function main() {
  console.log('Localized browser acceptance — deterministic public fixtures');
  const login = await api('/auth/login/email', {
    method: 'POST',
    body: {
      email,
      password,
      device: {
        deviceKey: `localized-browser-${Date.now()}`,
        platform: 'WEB',
        name: 'Localized browser acceptance',
      },
    },
  });
  const fixture = {};
  const browser = new CdpBrowser();

  try {
    // Keep the browsing account distinct from the listing owner. The owner experience
    // intentionally omits the enquiry control this story verifies.
    const fixtureOwnerLogin = await api('/auth/login/email', {
      method: 'POST',
      body: {
        email: fixtureOwnerEmail,
        password,
        device: {
          deviceKey: `localized-fixture-owner-${Date.now()}`,
          platform: 'WEB',
          name: 'Localized fixture owner',
        },
      },
    });
    await createPublicFixtures(fixtureOwnerLogin.tokens.accessToken, fixture);
    check(
      'fixture business is publicly addressable',
      Boolean((await api(`/businesses/${fixture.business.slug}`)).id),
    );
    check(
      'fixture listing is published with a photo',
      fixture.listing.status === 'PUBLISHED' && fixture.listing.media.length > 0,
    );

    await browser.start();
    await browser.viewport(430, 920);
    await browser.setSession(login, 'te');
    await browser.navigate(
      `/business?q=${encodeURIComponent(fixture.business.name.split(' ')[0])}`,
    );
    check(
      'Telugu directory renders translated hierarchy and fixture card',
      await browser.evaluate(`(() => {
        const copy = document.querySelector('.business-directory')?.innerText ?? '';
        return document.documentElement.lang === 'te' &&
          copy.includes(${JSON.stringify(messages.te.businessDirectory.title)}) &&
          Boolean(document.querySelector('a[href="/b/${fixture.business.slug}"]'));
      })()`),
    );
    check(
      'Telugu directory has no mobile horizontal overflow',
      await browser.evaluate(
        'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
      ),
    );
    await assertAccessible(browser, 'Telugu directory passes WCAG A/AA automation');

    await browser.navigate(`/ad/${fixture.listing.slug}`);
    check(
      'Telugu listing renders translated detail chrome',
      await browser.evaluate(
        `document.body.innerText.includes(${JSON.stringify(messages.te.listing.aboutKicker)})`,
      ),
    );
    await browser.click('.listing-gallery__image');
    await browser.waitFor(
      `Boolean(document.querySelector('.listing-gallery__lightbox'))`,
      'localized lightbox',
    );
    check(
      'Telugu lightbox exposes localized accessible naming',
      await browser.evaluate(
        `document.querySelector('.listing-gallery__lightbox')?.getAttribute('aria-label') ===
         ${JSON.stringify(messages.te.listing.photoViewer)}`,
      ),
    );
    await browser.press('Escape');
    await browser.waitFor(
      `!document.querySelector('.listing-gallery__lightbox')`,
      'localized lightbox close',
    );

    await browser.setSession(login, 'hi');
    await browser.navigate(`/ad/${fixture.listing.slug}`);
    await browser.click('.contact-panel__trigger');
    await browser.waitFor(
      `Boolean(document.querySelector('.contact-panel__composer'))`,
      'Hindi enquiry composer',
    );
    check(
      'Hindi enquiry uses localized prompt and safe default message',
      await browser.evaluate(`(() => {
        const composer = document.querySelector('.contact-panel__composer');
        return composer?.innerText.includes(${JSON.stringify(messages.hi.listing.yourMessage)}) &&
          composer?.querySelector('textarea')?.value ===
            ${JSON.stringify(messages.hi.listing.defaultMessage)};
      })()`),
    );
    await assertAccessible(browser, 'Hindi enquiry composer passes WCAG A/AA automation');
    check(
      'focused browser story emitted no runtime errors',
      browser.errors.length === 0,
      browser.errors.join(' | '),
    );
  } finally {
    browser.close();
    await cleanupPublicFixtures(login.tokens.accessToken, fixture);
  }

  console.log(`\n${passed} focused checks passed.`);
}

main().catch((error) => {
  console.error(`\nLocalized browser acceptance aborted: ${error.message}`);
  process.exitCode = 1;
});
