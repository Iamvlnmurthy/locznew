#!/usr/bin/env node
/**
 * Browser interaction acceptance gate.
 *
 *   node scripts/acceptance-browser.mjs
 *
 * Presentation checks cannot prove that a drawer closes with Escape, a lightbox releases
 * the page scroll lock, or an optimistic save reaches the database. This gate drives a
 * real local Chrome through the DevTools protocol and confirms both DOM and API state.
 *
 * It uses seeded development accounts, creates one clearly labelled harmless safety fixture,
 * and restores every touched listing, business, safety case, audit row and device when done.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
dotenv.config({ path: resolve(root, '.env'), quiet: true });
const { Client } = pg;
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const localeMessages = Object.fromEntries(
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
const postableTypes = [
  'PRODUCT',
  'JOB',
  'OFFER',
  'SERVICE',
  'RENTAL',
  'BUYER_REQUIREMENT',
  'EVENT',
];
const API = process.env.LOCZ_API ?? 'http://127.0.0.1:4000/api/v1';
const WEB = process.env.LOCZ_WEB ?? 'http://localhost:3000';
const EMAIL = process.env.LOCZ_BROWSER_EMAIL ?? 'buyer@locz.test';
const FIXTURE_OWNER_EMAIL = process.env.LOCZ_BROWSER_FIXTURE_OWNER_EMAIL ?? 'seller@locz.test';
const PASSWORD = process.env.LOCZ_BROWSER_PASSWORD ?? 'LocZ@dev1234';
const TEST_PHOTO =
  process.env.LOCZ_BROWSER_TEST_PHOTO ??
  resolve(root, 'apps', 'web', 'public', 'seed', 'listings', 'iphone-13-blue.webp');
const SCREENSHOT_DIR = process.env.LOCZ_SCREENSHOT_DIR;

function imageMimeType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === '.webp') return 'image/webp';
  if (extension === '.png') return 'image/png';
  return 'image/jpeg';
}
/**
 * How long a single navigation may take before it counts as a failure.
 *
 * Deliberately far longer than the 10s used for assertions. Against a development server
 * Next.js compiles a route the first time anybody asks for it, and a cold route can take
 * tens of seconds — so the previous 10s reported "timed out waiting for /business?q=…" for
 * a page that was fine, and passed on the very next run once the route was warm. A gate
 * that fails on first touch and passes on second teaches people to re-run rather than read
 * it, which is how real failures get waved through.
 *
 * This is patience, not leniency: every assertion *after* the page loads keeps its short
 * timeout, so a page that loads and then misbehaves still fails quickly.
 */
const NAVIGATION_TIMEOUT = Number(process.env.LOCZ_BROWSER_NAV_TIMEOUT ?? 60_000);

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

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

async function checkAccessibility(browser, label) {
  const violations = await browser.accessibilityViolations();
  const detail = violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.targets.join(', ')}`,
    )
    .join(' | ');
  check(label, violations.length === 0, detail);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitUntil(action, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await action();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

export async function api(path, { method = 'GET', body, token, retries = 2 } = {}) {
  const init = {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  let response = await fetch(`${API}${path}`, init);
  for (let attempt = 0; response.status === 429 && attempt < retries; attempt += 1) {
    const responseBody = await response.clone().text();
    const header = Number(response.headers.get('retry-after') ?? 0);
    const hinted = Number(/try again in (\d+) seconds/i.exec(responseBody)?.[1] ?? 0);
    const seconds = header > 0 ? header : hinted > 0 ? hinted : 62;

    if (seconds > 180) {
      throw new Error(
        `${method} ${path} is rate limited for ${seconds}s; wait for the local test window to reset`,
      );
    }

    console.log(`    (browser API rate limited — waiting ${seconds + 2}s)`);
    await delay((seconds + 2) * 1000);
    response = await fetch(`${API}${path}`, init);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 200)}`);
  }
  const payload = text ? JSON.parse(text) : null;
  return payload?.data ?? payload;
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === 'win32'
      ? join(process.env['ProgramFiles(x86)'] ?? '', 'Google/Chrome/Application/chrome.exe')
      : null,
    process.platform === 'win32'
      ? join(process.env.ProgramFiles ?? '', 'Google/Chrome/Application/chrome.exe')
      : null,
    process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe')
      : null,
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : null,
    process.platform === 'linux' ? '/usr/bin/google-chrome' : null,
    process.platform === 'linux' ? '/usr/bin/chromium' : null,
    process.platform === 'linux' ? '/usr/bin/chromium-browser' : null,
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Chrome was not found. Set CHROME_PATH to run browser acceptance.');
  }
  return found;
}

export class CdpBrowser {
  constructor() {
    this.profileDirectory = mkdtempSync(join(tmpdir(), 'locz-browser-acceptance-'));
    this.port = 9300 + Math.floor(Math.random() * 300);
    this.pending = new Map();
    this.nextId = 0;
    this.errors = [];
    this.httpErrors = [];
  }

  async start() {
    this.process = spawn(
      chromeExecutable(),
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.profileDirectory}`,
        'about:blank',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );

    const target = await waitUntil(async () => {
      const response = await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, {
        method: 'PUT',
      }).catch(() => null);
      return response?.ok ? response.json() : null;
    }, 'Chrome DevTools');

    this.socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        this.errors.push(
          details.exception?.description ??
            details.stackTrace?.callFrames
              ?.map(
                (frame) =>
                  `${frame.functionName || '<anonymous>'} (${frame.url}:${frame.lineNumber + 1})`,
              )
              .join(' <- ') ??
            details.text,
        );
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        this.errors.push(message.params.entry.text);
      }
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 500) {
        this.httpErrors.push(`${message.params.response.status} ${message.params.response.url}`);
      }
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)(message);
        this.pending.delete(message.id);
      }
    };

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Network.enable');
    // Inject axe before every document is evaluated so accessibility checks exercise the
    // same rendered states as the interaction gate, including the separate admin origin.
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: axeSource });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, (message) => {
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? 'Browser evaluation failed',
      );
    }
    return result.result.value;
  }

  async navigate(path) {
    const url = path.startsWith('http') ? path : `${WEB}${path}`;
    const navigation = await this.send('Page.navigate', { url });
    if (navigation.errorText) {
      throw new Error(`Could not navigate to ${url}: ${navigation.errorText}`);
    }
    await waitUntil(
      async () => {
        const frameTree = await this.send('Page.getFrameTree');
        const reachedNewDocument =
          !navigation.loaderId || frameTree.frameTree.frame.loaderId === navigation.loaderId;
        return (
          reachedNewDocument &&
          (await this.evaluate(
            `document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`,
          ))
        );
      },
      url,
      NAVIGATION_TIMEOUT,
    );
    // `complete` means the server document and assets arrived; React can still be attaching
    // handlers to client islands. Waiting here avoids a false failure where a real button is
    // clicked a few milliseconds before it becomes interactive.
    await delay(1_000);
  }

  async waitFor(expression, label, timeout) {
    try {
      return await waitUntil(() => this.evaluate(expression), label, timeout);
    } catch (error) {
      const pageState = await this.evaluate(
        `JSON.stringify({
        url: location.href,
        readyState: document.readyState,
        hasNextOverlay: Boolean(document.querySelector('[data-nextjs-dialog]')),
        filterExpanded: document.querySelector('.search-filter-trigger')?.getAttribute('aria-expanded'),
        filterClass: document.querySelector('.search-filters')?.className,
      })`,
      ).catch(() => 'unavailable');
      throw new Error(
        `${error.message}; page=${pageState}; browserErrors=${this.errors.join(' | ') || 'none'}`,
      );
    }
  }

  async click(selector) {
    const clicked = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Could not find element: ${selector}`);
  }

  async clickWithin(containerSelector, targetSelector) {
    const clicked = await this.evaluate(`(() => {
      const container = document.querySelector(${JSON.stringify(containerSelector)});
      const element = container?.querySelector(${JSON.stringify(targetSelector)});
      if (!element) return false;
      element.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Could not find ${targetSelector} inside ${containerSelector}`);
  }

  async fill(selector, value) {
    const filled = await this.evaluate(`(() => {
      const field = document.querySelector(${JSON.stringify(selector)});
      if (!field) return false;
      const prototype = field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!filled) throw new Error(`Could not find input: ${selector}`);
  }

  async select(selector, value) {
    const selected = await this.evaluate(`(() => {
      const field = document.querySelector(${JSON.stringify(selector)});
      if (!(field instanceof HTMLSelectElement)) return false;
      if (!Array.from(field.options).some((option) => option.value === ${JSON.stringify(value)})) {
        return false;
      }
      field.value = ${JSON.stringify(value)};
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      // A controlled React select can immediately render its previous value while a
      // server action is pending. Callers wait for the resulting URL/DOM state instead.
      return true;
    })()`);
    if (!selected) throw new Error(`Could not select ${value} in ${selector}`);
  }

  async press(key, code = key) {
    for (const type of ['keyDown', 'keyUp']) {
      await this.send('Input.dispatchKeyEvent', { type, key, code });
    }
  }

  async screenshot(name) {
    if (!SCREENSHOT_DIR) return;
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    writeFileSync(join(SCREENSHOT_DIR, name), Buffer.from(data, 'base64'));
  }

  accessibilityViolations() {
    return this.evaluate(`(async () => {
      if (!window.axe) throw new Error('axe-core was not injected');
      const results = await window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
        },
        resultTypes: ['violations'],
      });
      return results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
      }));
    })()`);
  }

  viewport(width, height) {
    return this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
  }

  async setLocale(locale) {
    await this.send('Network.setCookie', {
      name: 'locz_locale',
      value: locale,
      url: WEB,
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    });
  }

  async setSession(login, locale = 'en') {
    const user = JSON.stringify({
      id: login.user.id,
      displayName: login.user.displayName,
      roles: login.user.roles,
      permissions: login.user.permissions,
    });
    for (const [name, value, httpOnly] of [
      ['locz_access', login.tokens.accessToken, true],
      ['locz_refresh', login.tokens.refreshToken, true],
      ['locz_user', user, true],
      ['locz_locale', locale, false],
    ]) {
      await this.send('Network.setCookie', {
        name,
        value,
        url: WEB,
        path: '/',
        httpOnly,
        sameSite: 'Lax',
      });
    }
  }

  async setAdminSession(login) {
    const user = JSON.stringify({
      id: login.user.id,
      displayName: login.user.displayName,
      email: login.user.email ?? null,
      roles: login.user.roles,
      permissions: login.user.permissions,
    });
    for (const [name, value] of [
      ['locz_admin_access', login.tokens.accessToken],
      ['locz_admin_refresh', login.tokens.refreshToken],
      ['locz_admin_user', user],
    ]) {
      await this.send('Network.setCookie', {
        name,
        value,
        url: 'http://localhost:3001',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      });
    }
  }

  async cookie(name) {
    const { cookies } = await this.send('Network.getCookies', { urls: [WEB] });
    return cookies.find((cookie) => cookie.name === name)?.value ?? null;
  }

  async deleteCookie(name) {
    await this.send('Network.deleteCookies', { name, url: WEB });
  }

  clearErrors() {
    this.errors = [];
    this.httpErrors = [];
  }

  close() {
    this.socket?.close();
    this.process?.kill();
    try {
      rmSync(this.profileDirectory, { recursive: true, force: true });
    } catch {
      // Chrome can hold profile files briefly on Windows; the OS temp cleaner will remove them.
    }
  }
}

async function isSaved(token, listingId) {
  const saved = await api('/listings/saved?limit=50', { token });
  return saved.items.some((item) => item.id === listingId);
}

function assertLocalFixtureTarget() {
  const apiUrl = new URL(API);
  if (process.env.NODE_ENV === 'production' || !localHosts.has(apiUrl.hostname)) {
    throw new Error('Browser fixtures are restricted to a local non-production API.');
  }
}

export async function createPublicFixtures(ownerToken, fixture) {
  assertLocalFixtureTarget();
  if (!existsSync(TEST_PHOTO)) {
    throw new Error(`Browser fixture photo was not found: ${TEST_PHOTO}`);
  }

  const [cities, productCategories, businessCategories] = await Promise.all([
    api('/locations/cities?launchedOnly=true&limit=10'),
    api('/categories?listingType=PRODUCT'),
    api('/categories?listingType=BUSINESS_LISTING'),
  ]);
  const city = cities[0];
  const productCategory =
    productCategories.flatMap((category) => category.children ?? []).find(Boolean) ??
    productCategories[0];
  const businessCategory =
    businessCategories.flatMap((category) => category.children ?? []).find(Boolean) ??
    businessCategories[0];
  if (!city || !productCategory || !businessCategory) {
    throw new Error(
      'Cities and product/business categories must exist before browser verification.',
    );
  }

  // Begin with a letter and keep the token alphanumeric. A bare UUID segment can
  // occasionally contain digits only, and Meilisearch deliberately does not treat a long
  // numeric identifier as a searchable word. That made one-result browser checks flaky.
  const marker = `z${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  const adminLogin = await api('/auth/login/email', {
    method: 'POST',
    body: {
      email: 'admin@locz.test',
      password: PASSWORD,
      device: {
        deviceKey: `browser-fixture-admin-${marker}`,
        platform: 'WEB',
        name: 'Browser fixture approval',
      },
    },
  });
  // The caller owns the reversible business/listing; the administrator only approves it.
  // Using the moderator as every fixture owner exhausted that shared account's real daily
  // posting limit and also erased the ownership boundary these journeys are meant to test.
  fixture.ownerToken = ownerToken;
  fixture.business = await api('/businesses', {
    method: 'POST',
    token: fixture.ownerToken,
    body: {
      name: `Browser Fixture Studio ${marker}`,
      categoryId: businessCategory.id,
      cityId: city.id,
      description: 'A reversible local business created only for browser verification.',
      addressLine: 'Browser Fixture Lane',
      primaryPhone: '+919876543210',
    },
  });

  fixture.listing = await api('/listings', {
    method: 'POST',
    token: fixture.ownerToken,
    body: {
      type: 'PRODUCT',
      title: `Browser fixture phone ${marker}`,
      description:
        'A harmless photographed listing created for deterministic browser interaction checks.',
      categoryId: productCategory.id,
      cityId: city.id,
      contactPreference: 'IN_APP_ONLY',
      marketplace: {
        price: 4500,
        condition: 'GOOD',
        isNegotiable: true,
      },
    },
  });

  const photo = readFileSync(TEST_PHOTO);
  const photoMimeType = imageMimeType(TEST_PHOTO);
  const upload = await api(`/listings/${fixture.listing.id}/media/upload-url`, {
    method: 'POST',
    token: fixture.ownerToken,
    body: { mimeType: photoMimeType, sizeBytes: photo.length },
  });
  const uploaded = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': photoMimeType },
    body: photo,
  });
  if (!uploaded.ok) {
    throw new Error(`Fixture photo upload failed with HTTP ${uploaded.status}`);
  }
  await api(`/media/${upload.mediaId}/confirm`, {
    method: 'POST',
    token: fixture.ownerToken,
  });
  // Approval is idempotent. Do it before using the public slug endpoint because a
  // pending listing is intentionally invisible there.
  await api(`/moderation/listings/${fixture.listing.id}/approve`, {
    method: 'POST',
    token: adminLogin.tokens.accessToken,
    body: { note: 'Deterministic browser fixture' },
  });

  fixture.listing = await waitUntil(
    async () => {
      const detail = await api(`/listings/${encodeURIComponent(fixture.listing.slug)}`);
      return detail.status === 'PUBLISHED' &&
        detail.media.some((item) => item.fullUrl || item.cardUrl || item.thumbUrl)
        ? detail
        : false;
    },
    'published browser listing fixture',
    20_000,
  );

  return fixture;
}

export async function cleanupPublicFixtures(_token, fixture) {
  const ownerToken = fixture.ownerToken;
  if (fixture.listing?.id) {
    await api(`/listings/${fixture.listing.id}`, {
      method: 'DELETE',
      token: ownerToken,
    }).catch(() => undefined);
  }
  if (fixture.business?.id) {
    await api(`/businesses/${fixture.business.id}`, {
      method: 'DELETE',
      token: ownerToken,
    }).catch(() => undefined);
  }

  // Product deletion is intentionally soft, but these rows are synthetic test setup.
  // Leaving them behind makes the real 24-hour posting cap accumulate across otherwise
  // clean runs. Hard-delete only the exact IDs this run created, only against a local DB,
  // and retain name/title guards so a bad fixture object cannot remove a real record.
  if (process.env.DATABASE_URL && (fixture.listing?.id || fixture.business?.id)) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    const apiUrl = new URL(API);
    if (
      process.env.NODE_ENV === 'production' ||
      !localHosts.has(databaseUrl.hostname) ||
      !localHosts.has(apiUrl.hostname)
    ) {
      throw new Error('Hard cleanup of browser fixtures is restricted to the local stack.');
    }

    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      await db.query('begin');
      if (fixture.listing?.id) {
        await db.query(
          `delete from listings
           where id = $1 and title like 'Browser fixture phone %'`,
          [fixture.listing.id],
        );
      }
      if (fixture.business?.id) {
        await db.query(
          `delete from businesses
           where id = $1 and name like 'Browser Fixture Studio %'`,
          [fixture.business.id],
        );
      }
      await db.query('commit');
    } catch (error) {
      await db.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      await db.end();
    }
  }
}

async function createSyntheticSafetyCase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the reversible safety-console journey.');
  }
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const apiUrl = new URL(API);
  if (
    process.env.NODE_ENV === 'production' ||
    !localHosts.has(databaseUrl.hostname) ||
    !localHosts.has(apiUrl.hostname)
  ) {
    throw new Error(
      'The synthetic safety-console journey is restricted to a local non-production stack.',
    );
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const picked = await db.query(
    `select m.id, m.status::text as "mediaStatus", m."failureReason"
     from listing_media m
     join listings l on l.id = m."listingId"
     where l.status = 'ARCHIVED'
       and not exists (
         select 1 from media_safety_cases c where c."mediaId" = m.id
       )
     order by m."createdAt" asc
     limit 1`,
  );
  const media = picked.rows[0];
  if (!media) {
    await db.end();
    throw new Error('No harmless archived seed media is available for browser verification.');
  }

  const caseId = randomUUID();
  await db.query('begin');
  try {
    await db.query(
      `update listing_media
       set status = 'LEGAL_HOLD', "failureReason" = $2
       where id = $1`,
      [media.id, 'Synthetic browser verification hold — harmless seeded image'],
    );
    await db.query(
      `insert into media_safety_cases
         (id, "mediaId", status, provider, "providerReference", "reasonCode", "openedAt", "updatedAt")
       values ($1, $2, 'OPEN', $3, $4, $5, now(), now())`,
      [
        caseId,
        media.id,
        'synthetic-browser-verification',
        `SAFE-BROWSER-${caseId}`,
        'SYNTHETIC_BROWSER_VERIFICATION',
      ],
    );
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    await db.end();
    throw error;
  }

  return {
    caseId,
    db,
    media,
    deviceKey: `safety-browser-${randomUUID()}`,
  };
}

async function cleanupSyntheticSafetyCase(fixture) {
  if (!fixture) return;
  const { caseId, db, media, deviceKey } = fixture;
  try {
    await db.query('begin');
    await db.query('delete from media_safety_access_logs where "caseId" = $1', [caseId]);
    await db.query('delete from media_safety_cases where id = $1', [caseId]);
    await db.query(
      `update listing_media
       set status = $2::"MediaStatus", "failureReason" = $3
       where id = $1`,
      [media.id, media.mediaStatus, media.failureReason],
    );
    await db.query('delete from devices where "deviceKey" = $1', [deviceKey]);
    await db.query('commit');
  } catch (error) {
    await db.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}

async function main() {
  console.log(`LocZ browser acceptance — API ${API}, web ${WEB}`);
  const businessSafetyOnly = process.argv.includes('--business-safety');
  if (businessSafetyOnly) {
    console.log('Scope: business management and restricted safety workflows');
  }

  const login = await api('/auth/login/email', {
    method: 'POST',
    body: {
      email: EMAIL,
      password: PASSWORD,
      device: {
        deviceKey: `browser-acceptance-${Date.now()}`,
        platform: 'WEB',
        name: 'Browser acceptance',
      },
    },
  });
  const token = login.tokens.accessToken;
  const publicFixture = {};
  let business;
  let listing;

  const browser = new CdpBrowser();
  let createdBusiness;
  let safetyFixture;
  try {
    if (!businessSafetyOnly) {
      // The browser acts as a prospective buyer. Fixture ownership must belong to a
      // different account; owners correctly do not see Save or Contact Seller controls.
      const fixtureOwnerLogin = await api('/auth/login/email', {
        method: 'POST',
        body: {
          email: FIXTURE_OWNER_EMAIL,
          password: PASSWORD,
          device: {
            deviceKey: `browser-fixture-owner-${Date.now()}`,
            platform: 'WEB',
            name: 'Browser fixture owner',
          },
        },
      });
      await createPublicFixtures(fixtureOwnerLogin.tokens.accessToken, publicFixture);
      business = publicFixture.business;
      listing = publicFixture.listing;
      await api(`/listings/${listing.id}/save`, { method: 'DELETE', token });
    }
    await browser.start();

    if (!businessSafetyOnly) {
      // ------------------------------------------------------- multilingual essentials
      step('0. Telugu and Hindi essential journeys');
      await browser.viewport(430, 920);
      await browser.navigate('/signin');
      await browser.select('#locale-switcher', 'te');
      await browser.waitFor(
        `document.documentElement.lang === 'te' &&
       document.querySelector('.signin-story h1')?.textContent ===
         ${JSON.stringify(localeMessages.te.auth.pageTitle)}`,
        'Telugu sign-in refresh',
        15_000,
      );
      check(
        'language switch persists Telugu and renders the translated sign-in',
        (await browser.cookie('locz_locale')) === 'te' &&
          (await browser.evaluate(
            `document.querySelector('.signin-panel h2')?.textContent ===
           ${JSON.stringify(localeMessages.te.auth.signInTitle)}`,
          )),
      );
      check(
        'Telugu sign-in stays inside the mobile viewport',
        await browser.evaluate(
          `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
        ),
      );
      await checkAccessibility(browser, 'Telugu sign-in passes automated WCAG A/AA checks');
      await browser.screenshot('signin-telugu-mobile.png');

      await browser.navigate('/location');
      check(
        'Telugu location renders translated controls',
        await browser.evaluate(
          `document.documentElement.lang === 'te' &&
         document.querySelector('.location-page__story h1')?.textContent ===
           ${JSON.stringify(localeMessages.te.location.pageTitle)} &&
         document.querySelector('.location-picker__divider span')?.textContent?.includes(
           ${JSON.stringify(localeMessages.te.location.pincodeLabel)}
         )`,
        ),
      );
      check(
        'Telugu location stays inside the mobile viewport',
        await browser.evaluate(
          `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
        ),
      );
      await checkAccessibility(browser, 'Telugu location passes automated WCAG A/AA checks');
      await browser.screenshot('location-telugu-mobile.png');

      await browser.select('#locale-switcher', 'hi');
      await browser.waitFor(
        `document.documentElement.lang === 'hi' &&
       document.querySelector('.location-page__story h1')?.textContent ===
         ${JSON.stringify(localeMessages.hi.location.pageTitle)}`,
        'Hindi location refresh',
        15_000,
      );
      check(
        'language switch persists Hindi and renders the translated location flow',
        (await browser.cookie('locz_locale')) === 'hi' &&
          (await browser.evaluate(
            `document.querySelector('.location-picker__divider span')?.textContent?.includes(
             ${JSON.stringify(localeMessages.hi.location.pincodeLabel)}
           )`,
          )),
      );
      check(
        'Hindi location stays inside the mobile viewport',
        await browser.evaluate(
          `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
        ),
      );
      await checkAccessibility(browser, 'Hindi location passes automated WCAG A/AA checks');
      await browser.screenshot('location-hindi-mobile.png');

      await browser.navigate('/signin');
      check(
        'Hindi sign-in renders translated identity and controls',
        await browser.evaluate(
          `document.documentElement.lang === 'hi' &&
         document.querySelector('.signin-story h1')?.textContent ===
           ${JSON.stringify(localeMessages.hi.auth.pageTitle)} &&
         document.querySelector('.signin-panel h2')?.textContent ===
           ${JSON.stringify(localeMessages.hi.auth.signInTitle)}`,
        ),
      );
      check(
        'Hindi sign-in stays inside the mobile viewport',
        await browser.evaluate(
          `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
        ),
      );
      await checkAccessibility(browser, 'Hindi sign-in passes automated WCAG A/AA checks');
      await browser.screenshot('signin-hindi-mobile.png');

      for (const locale of ['te', 'hi']) {
        await browser.setSession(login, locale);
        await browser.navigate('/post');
        const expectedTypes = postableTypes.map((type) => localeMessages[locale].post.type[type]);
        check(
          `${locale === 'te' ? 'Telugu' : 'Hindi'} post entry renders every translated listing type`,
          await browser.evaluate(
            `(() => {
            const expected = ${JSON.stringify(expectedTypes)};
            const body = document.querySelector('.post-experience')?.textContent ?? '';
            return document.documentElement.lang === ${JSON.stringify(locale)} &&
              document.querySelector('.post-form__intro h1')?.textContent ===
                ${JSON.stringify(localeMessages[locale].post.title)} &&
              expected.every((label) => body.includes(label));
          })()`,
          ),
        );
        check(
          `${locale === 'te' ? 'Telugu' : 'Hindi'} visible post wizard has no English copy leakage`,
          await browser.evaluate(
            `(() => {
            const wizard = ${JSON.stringify(localeMessages[locale].post.wizard)};
            const visibleCopy = [
              document.querySelector('.post-form__intro')?.innerText,
              document.querySelector('.post-progress')?.innerText,
              document.querySelector('.post-step[data-step="1"]')?.innerText,
              document.querySelector('.post-guide')?.innerText,
            ].filter(Boolean).join(' ');
            const expected = [
              wizard.freeToPost,
              wizard.choose,
              wizard.step1Label,
              wizard.step1Title,
              wizard.listingType,
              wizard.continue,
              wizard.guide1Title,
            ];
            const forbidden = [
              'Free to post',
              'What it is',
              'Tell the story',
              'Ready to post',
              'Step 1 of 3',
              'What would you like to share?',
              'Listing type',
              'Select the closest category',
              'A better local listing',
            ];
            return expected.every((text) => visibleCopy.includes(text)) &&
              forbidden.every((text) => !visibleCopy.includes(text));
          })()`,
          ),
        );
        check(
          `${locale === 'te' ? 'Telugu' : 'Hindi'} post entry stays inside the mobile viewport`,
          await browser.evaluate(
            `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
          ),
        );
        await checkAccessibility(
          browser,
          `${locale === 'te' ? 'Telugu' : 'Hindi'} post entry passes automated WCAG A/AA checks`,
        );
        await browser.screenshot(`post-${locale === 'te' ? 'telugu' : 'hindi'}-mobile.png`);

        const detailProbeByType = {
          PRODUCT: 'condition',
          JOB: 'companyName',
          OFFER: 'prices',
          SERVICE: 'serviceType',
          RENTAL: 'propertyType',
          BUYER_REQUIREMENT: 'acceptedCondition',
          EVENT: 'startsEnds',
        };
        const englishDetailCopy = [
          'Condition',
          'Company name',
          'Prices (₹)',
          'What service do you provide?',
          'Property type',
          'Condition you would accept',
          'Starts / ends',
        ];

        for (const type of postableTypes) {
          await browser.navigate('/post');
          await browser.click(`input[name="type"][value="${type}"]`);
          await browser.waitFor(
            `document.querySelector('input[name="type"][value="${type}"]')?.checked === true &&
           document.querySelectorAll('#categoryId option').length > 1`,
            `${locale} ${type} category options`,
          );
          const categoryId = await browser.evaluate(
            `document.querySelector('#categoryId option:not([value=""])')?.value`,
          );
          await browser.select('#categoryId', categoryId);
          await browser.click('.post-step[data-step="1"] .btn--primary');
          await browser.waitFor(
            `document.querySelector('.post-step[data-step="2"]')?.hidden === false`,
            `${locale} ${type} detail step`,
          );

          const expectedDetail = localeMessages[locale].post.detailFields[detailProbeByType[type]];
          check(
            `${locale === 'te' ? 'Telugu' : 'Hindi'} ${type} details render localized copy`,
            await browser.evaluate(
              `(() => {
              const copy = document.querySelector('.post-step[data-step="2"]')?.innerText ?? '';
              return copy.includes(${JSON.stringify(expectedDetail)}) &&
                ${JSON.stringify(englishDetailCopy)}.every((text) => !copy.includes(text));
            })()`,
            ),
          );

          if (type === 'PRODUCT') {
            await browser.fill(
              '#title',
              locale === 'te' ? 'మంచి స్థితిలో ఫోన్' : 'अच्छी हालत में फ़ोन',
            );
            await browser.fill(
              '#description',
              locale === 'te'
                ? 'బాగా పనిచేస్తోంది, పెట్టె మరియు ఛార్జర్ ఉన్నాయి.'
                : 'अच्छी तरह काम करता है, डिब्बा और चार्जर साथ हैं।',
            );
            await browser.click('.post-step[data-step="2"] .btn--primary');
            await browser.waitFor(
              `document.querySelector('.post-step[data-step="3"]')?.hidden === false`,
              `${locale} review step`,
            );
            check(
              `${locale === 'te' ? 'Telugu' : 'Hindi'} final review renders localized copy`,
              await browser.evaluate(
                `(() => {
                const wizard = ${JSON.stringify(localeMessages[locale].post.wizard)};
                const copy = document.querySelector('.post-step[data-step="3"]')?.innerText ?? '';
                return copy.includes(wizard.step3Title) &&
                  copy.includes(wizard.contactPrivacy) &&
                  copy.includes(wizard.readyToPublish) &&
                  !copy.includes('Where should people find it?') &&
                  !copy.includes('Ready to publish');
              })()`,
              ),
            );
            await browser.screenshot(
              `post-review-${locale === 'te' ? 'telugu' : 'hindi'}-mobile.png`,
            );
          }
        }
      }

      await browser.setSession(login);

      // -------------------------------------------------------------- search drawer
      step('1. Sparse search results and mobile filter drawer');
      const uniqueListingSearchTerm = listing.title.split(' ').at(-1);
      await browser.viewport(1365, 900);
      await browser.navigate(`/search?q=${encodeURIComponent(uniqueListingSearchTerm)}`);
      await browser.waitFor(
        `Boolean(document.querySelector('a[href="/ad/${listing.slug}"]'))`,
        'unique listing search result',
        20_000,
      );
      check(
        'a single match uses correct singular result copy',
        await browser.evaluate(`(() => {
        const heading = document.querySelector('.search-page__hero h1')?.textContent ?? '';
        const localMatch = document.querySelector('.search-results__toolbar strong')?.textContent ?? '';
        return heading.startsWith('1 result for') && localMatch.trim() === '1 local match';
      })()`),
      );
      check(
        'a sparse desktop result uses the intentional editorial card layout',
        await browser.evaluate(`(() => {
        const card = document.querySelector('.listing-card--wide');
        return Boolean(document.querySelector('.search-results--sparse')) &&
          Boolean(card) &&
          card.getBoundingClientRect().width >= 600 &&
          document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      })()`),
      );
      await checkAccessibility(browser, 'sparse search page passes automated WCAG A/AA checks');
      await browser.screenshot('search-sparse-desktop.png');

      await browser.viewport(430, 920);
      await browser.navigate('/search');
      await browser.click('.search-filter-trigger');
      await browser.waitFor(
        `document.querySelector('.search-filters')?.classList.contains('is-open')`,
        'open search drawer',
      );
      check(
        'drawer opens and locks the page',
        await browser.evaluate(
          `document.body.classList.contains('has-search-drawer') &&
         document.querySelector('.search-filter-trigger')?.getAttribute('aria-expanded') === 'true'`,
        ),
      );
      await checkAccessibility(browser, 'open filter drawer passes automated WCAG A/AA checks');
      await browser.press('Escape');
      await browser.waitFor(
        `!document.querySelector('.search-filters')?.classList.contains('is-open')`,
        'close search drawer with Escape',
      );
      check(
        'Escape closes the drawer and releases the page',
        await browser.evaluate(`!document.body.classList.contains('has-search-drawer')`),
      );
      await checkAccessibility(browser, 'search page passes automated WCAG A/AA checks');

      await browser.click('.search-filter-trigger');
      await browser.fill('input[name="priceMax"]', '5000');
      await browser.click('.search-filters__actions button[type="submit"]');
      await browser.waitFor(
        `new URL(location.href).searchParams.get('priceMax') === '5000'`,
        'filter navigation',
      );
      check(
        'applying a drawer filter reaches the URL',
        (await browser.evaluate(`new URL(location.href).searchParams.get('priceMax')`)) === '5000',
        await browser.evaluate('location.pathname + location.search'),
      );

      // -------------------------------------------------------------- gallery
      step('2. Listing gallery lightbox');
      await browser.viewport(1365, 900);
      await browser.navigate(`/ad/${listing.slug}`);
      await browser.waitFor(
        `Boolean(document.querySelector('.listing-gallery__image'))`,
        'listing gallery image hydration',
      );
      await browser.click('.listing-gallery__image');
      await browser.waitFor(
        `Boolean(document.querySelector('.listing-gallery__lightbox[role="dialog"]'))`,
        'open gallery lightbox',
      );
      await checkAccessibility(browser, 'open photo viewer passes automated WCAG A/AA checks');
      check(
        'lightbox opens as a modal and locks the page',
        await browser.evaluate(
          `document.querySelector('.listing-gallery__lightbox')?.getAttribute('aria-modal') === 'true' &&
         document.body.classList.contains('has-gallery-lightbox')`,
        ),
      );
      await browser.press('Escape');
      await browser.waitFor(
        `!document.querySelector('.listing-gallery__lightbox')`,
        'close gallery lightbox with Escape',
      );
      check(
        'Escape closes the lightbox and releases the page',
        await browser.evaluate(`!document.body.classList.contains('has-gallery-lightbox')`),
      );

      await browser.viewport(390, 844);
      await browser.navigate(`/ad/${listing.slug}`);
      await browser.waitFor(
        `Boolean(document.querySelector('.listing-gallery__image img'))`,
        'mobile listing detail',
      );
      await browser.waitFor(
        `(() => {
          const image = document.querySelector('.listing-gallery__image img');
          return Boolean(image?.complete && image.naturalWidth > 0);
        })()`,
        'decoded mobile listing photo',
        20_000,
      );
      check(
        'mobile listing renders its approved photo',
        await browser.evaluate(`(() => {
          const image = document.querySelector('.listing-gallery__image img');
          return Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
        })()`),
      );
      check(
        'mobile listing keeps the full photo visible without consuming the viewport',
        await browser.evaluate(`(() => {
          const image = document.querySelector('.listing-gallery__image img');
          if (!image) return false;
          const style = getComputedStyle(image);
          const rect = image.getBoundingClientRect();
          return style.objectFit === 'contain' && rect.height <= 300;
        })()`),
      );
      check(
        'mobile message, save and share actions all fit without overlap',
        await browser.evaluate(`(() => {
          const buttons = [
            document.querySelector('.contact-panel__trigger'),
            ...document.querySelectorAll('.detail__secondary-actions .detail-action'),
          ];
          if (buttons.length !== 3 || buttons.some((button) => !button)) return false;
          const rects = buttons.map((button) => button.getBoundingClientRect());
          const inside = rects.every((rect) => rect.left >= 0 && rect.right <= innerWidth);
          const separate = rects.every((rect, index) =>
            rects.slice(index + 1).every((other) => rect.right <= other.left || other.right <= rect.left)
          );
          return inside && separate;
        })()`),
      );
      check(
        'mobile listing has no horizontal overflow',
        await browser.evaluate(
          `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
        ),
      );
      await checkAccessibility(browser, 'mobile listing passes automated WCAG A/AA checks');
      await browser.screenshot('listing-detail-mobile.png');

      // -------------------------------------------------------------- save toggle
      step('3. Optimistic save is durable');
      await browser.viewport(1365, 900);
      await browser.navigate(`/ad/${listing.slug}`);
      const saveSelector = 'button.detail-action[aria-pressed]';
      check(
        'listing begins unsaved',
        (await browser.evaluate(
          `document.querySelector(${JSON.stringify(saveSelector)})?.getAttribute('aria-pressed')`,
        )) === 'false',
      );
      await browser.click(saveSelector);
      await browser.waitFor(
        `document.querySelector(${JSON.stringify(saveSelector)})?.getAttribute('aria-pressed') === 'true'`,
        'optimistic saved state',
      );
      check('heart changes immediately', true);
      await waitUntil(() => isSaved(token, listing.id), 'saved listing in API');
      await browser.waitFor(
        `document.querySelector(${JSON.stringify(saveSelector)})?.disabled === false`,
        'save transition settled',
      );
      check('save reaches the API', true);

      await browser.click(saveSelector);
      await browser.waitFor(
        `document.querySelector(${JSON.stringify(saveSelector)})?.getAttribute('aria-pressed') === 'false'`,
        'optimistic unsaved state',
      );
      await waitUntil(async () => !(await isSaved(token, listing.id)), 'unsaved listing in API');
      check('unsave reaches the API', true);

      // -------------------------------------------------------------- library undo
      step('4. Saved-library undo');
      await api(`/listings/${listing.id}/save`, { method: 'POST', token });
      await browser.navigate('/dashboard?tab=saved');
      const cardSelector = `.library-card:has(a[href="/ad/${listing.slug}"])`;
      await browser.waitFor(
        `Boolean(document.querySelector(${JSON.stringify(cardSelector)}))`,
        'saved card',
      );
      await browser.clickWithin(cardSelector, '.library-card__save');
      await browser.waitFor(
        `Boolean(document.querySelector('.saved-library__toast button'))`,
        'undo notice',
      );
      check(
        'removal is optimistic and offers Undo',
        await browser.evaluate(
          `!document.querySelector(${JSON.stringify(cardSelector)}) &&
         document.querySelector('.saved-library__toast button')?.textContent.trim() === 'Undo'`,
        ),
      );
      await waitUntil(async () => !(await isSaved(token, listing.id)), 'library removal in API');
      await browser.click('.saved-library__toast button');
      await browser.waitFor(
        `Boolean(document.querySelector(${JSON.stringify(cardSelector)}))`,
        'restored saved card',
      );
      await waitUntil(() => isSaved(token, listing.id), 'library undo in API');
      check('Undo restores both the card and API state', true);

      // -------------------------------------------------------------- location
      step('5. Pincode location selection');
      await browser.deleteCookie('locz_city');
      await browser.navigate('/location');
      await browser.fill('#city-search', 'Srinagar');
      await browser.waitFor(
        `document.querySelector('.location-picker__city-list strong')?.textContent === 'Srinagar'`,
        'nationwide city result outside initial location payload',
        20_000,
      );
      check(
        'location search reaches a city outside its initial 50 results',
        await browser.evaluate(`(() => {
          const result = document.querySelector('.location-picker__city-list button');
          return result?.querySelector('strong')?.textContent === 'Srinagar' &&
            result?.querySelector('small')?.textContent === 'Jammu & Kashmir';
        })()`),
      );
      await browser.fill('#pincode', '500081');
      await browser.click('.location-picker__pincode button');
      await browser.waitFor(`location.pathname === '/'`, 'location redirect');
      const rawCity = await browser.cookie('locz_city');
      const city = rawCity ? JSON.parse(decodeURIComponent(rawCity)) : null;
      check(
        'pincode redirects home with exact area and city identity',
        city?.pincode === '500081' && Boolean(city?.id) && Boolean(city?.name),
        city ? `${city.pincode} · ${city.name}` : 'cookie missing',
      );

      // -------------------------------------------------------------- business discovery
      step('6. Business directory discovery');
      await browser.viewport(1365, 980);
      await browser.navigate(`/business?q=${encodeURIComponent(business.name.split(' ')[0])}`);
      await browser.screenshot('business-directory-desktop.png');
      await checkAccessibility(browser, 'business directory passes automated WCAG A/AA checks');
      await browser.fill('#business-city-filter', 'Chennai');
      await browser.waitFor(
        `document.querySelector('.city-combobox__options [role="option"] strong')?.textContent === 'Chennai'`,
        'searchable directory city options',
      );
      await browser.evaluate(`document.querySelector('#business-city-filter')?.focus()`);
      await browser.press('Enter');
      const directoryCityId = await browser.evaluate(
        `document.querySelector('.business-directory-filters input[name="cityId"]')?.value`,
      );
      check(
        'directory city filter supports keyboard search and selection',
        Boolean(directoryCityId) &&
          (await browser.evaluate(`document.querySelector('#business-city-filter')?.value`)) ===
            'Chennai, Tamil Nadu',
        `${directoryCityId ?? 'no id'} · ${await browser.evaluate(
          `document.querySelector('#business-city-filter')?.value`,
        )}`,
      );
      await browser.click('.business-directory-filters button[type="submit"]');
      await browser.waitFor(
        `new URLSearchParams(location.search).get('cityId') === ${JSON.stringify(directoryCityId)}`,
        'directory city filter URL',
      );
      check('directory sends the selected city to its query', true);
      await browser.waitFor(
        `document.querySelector('#business-city-filter')?.value === 'Chennai, Tamil Nadu'`,
        'server-rendered directory city label',
      );
      check('directory preserves the selected city label after navigation', true);
      await browser.navigate(`/business?q=${encodeURIComponent(business.name.split(' ')[0])}`);
      check(
        'directory renders the API business and its profile entry',
        await browser.evaluate(
          `document.querySelector('.business-directory-card a[href="/b/${business.slug}"]')?.textContent.trim() === ${JSON.stringify(business.name)}`,
        ),
        business.name,
      );
      check(
        'desktop directory has no error overlay or horizontal overflow',
        await browser.evaluate(
          `!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay') &&
         document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
        ),
      );

      await browser.viewport(430, 920);
      await browser.navigate(`/business?q=${encodeURIComponent(business.name.split(' ')[0])}`);
      await browser.screenshot('business-directory-mobile.png');
      await browser.waitFor(
        `Boolean(document.querySelector('.business-directory-card a[href="/b/${business.slug}"]'))`,
        'matching business card on mobile',
      );
      check(
        'mobile directory stays within the viewport',
        await browser.evaluate(
          `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
        ),
      );
      await browser.click(`.business-directory-card a[href="/b/${business.slug}"]`);
      await browser.waitFor(
        `location.pathname === ${JSON.stringify(`/b/${business.slug}`)} &&
       document.body.innerText.includes(${JSON.stringify(business.name)})`,
        'business profile navigation',
      );
      check(
        'directory card opens the matching public profile',
        await browser.evaluate(
          `location.pathname === ${JSON.stringify(`/b/${business.slug}`)} &&
         document.body.innerText.includes(${JSON.stringify(business.name)})`,
        ),
      );

      for (const locale of ['te', 'hi']) {
        await browser.setSession(login, locale);
        await browser.viewport(430, 920);
        await browser.navigate('/business/new');
        const onboarding = localeMessages[locale].businessOnboarding;
        check(
          `${locale === 'te' ? 'Telugu' : 'Hindi'} business onboarding renders localized copy`,
          await browser.evaluate(
            `(() => {
            const visible = document.querySelector('.business-onboarding')?.innerText ?? '';
            return document.documentElement.lang === ${JSON.stringify(locale)} &&
              visible.includes(${JSON.stringify(onboarding.heroKicker)}) &&
              visible.includes(${JSON.stringify(onboarding.step1Title)}) &&
              visible.includes(${JSON.stringify(onboarding.businessName)}) &&
              !visible.includes("Made for India’s local businesses") &&
              !visible.includes("Start with the essentials");
          })()`,
          ),
        );
        check(
          `${locale === 'te' ? 'Telugu' : 'Hindi'} business onboarding stays inside the mobile viewport`,
          await browser.evaluate(
            `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
          ),
        );
        await checkAccessibility(
          browser,
          `${locale === 'te' ? 'Telugu' : 'Hindi'} business onboarding passes automated WCAG A/AA checks`,
        );
        await browser.screenshot(
          `business-onboarding-${locale === 'te' ? 'telugu' : 'hindi'}-mobile.png`,
        );
      }
    }

    // -------------------------------------------------------------- business owner journey
    step('7. Business creation and management');
    await browser.setSession(login);
    await browser.viewport(1365, 980);
    await browser.navigate('/business/new');
    await checkAccessibility(browser, 'business onboarding passes automated WCAG A/AA checks');
    const draftKey = `locz-business-draft:${login.user.id}`;
    await browser.evaluate(`localStorage.removeItem(${JSON.stringify(draftKey)})`);
    await browser.navigate('/business/new');
    await browser.screenshot('business-onboarding-desktop.png');
    await browser.viewport(430, 920);
    await browser.navigate('/business/new');
    await browser.screenshot('business-onboarding-mobile.png');
    check(
      'business onboarding stays within the mobile viewport',
      await browser.evaluate(
        `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
      ),
    );
    await browser.viewport(1365, 980);
    await browser.navigate('/business/new');

    await browser.click('.business-actions--end button');
    await browser.waitFor(
      `document.querySelector('.business-step-error')?.textContent.includes('business name')`,
      'business step validation',
    );
    check('onboarding blocks an unnamed business with useful guidance', true);

    const businessName = `Browser Neighbourhood Studio ${Date.now()}`;
    await browser.fill('#business-name', businessName);
    await browser.click('.business-category__quick button');
    await delay(500);
    await browser.navigate('/business/new');
    check(
      'an unfinished business draft survives a page reload',
      (await browser.evaluate(`document.querySelector('#business-name')?.value`)) ===
        businessName &&
        Boolean(await browser.evaluate(`document.querySelector('#business-category')?.value`)),
    );

    await browser.click('.business-actions--end button');
    await browser.waitFor(
      `Boolean(document.querySelector('#business-city')?.closest('.business-step:not([hidden])'))`,
      'business location step',
    );
    await browser.fill('#business-city', 'Srinagar');
    await browser.waitFor(
      `document.querySelector('[role="listbox"] [role="option"] strong')?.textContent === 'Srinagar'`,
      'district outside the initial city window',
    );
    await browser.evaluate(`document.querySelector('#business-city')?.focus()`);
    await browser.press('ArrowDown');
    await browser.press('Enter');
    const searchedCityId = await browser.waitFor(
      `document.querySelector('input[type="hidden"][name="cityId"]')?.value`,
      'keyboard-selected district id',
    );
    check(
      'city search reaches and selects a district outside the initial 50',
      Boolean(searchedCityId) &&
        (await browser.evaluate(`document.querySelector('#business-city')?.value`)) ===
          'Srinagar, Jammu & Kashmir',
    );
    await browser.fill('#business-address', 'Acceptance Lane, Neighbourhood Centre');
    await browser.fill(
      '#business-description',
      'A temporary local studio used to verify the complete owner experience.',
    );
    await browser.click('.business-step:not([hidden]) .business-actions .btn--primary');
    await browser.waitFor(
      `Boolean(document.querySelector('#business-phone')?.closest('.business-step:not([hidden])'))`,
      'business contact step',
    );

    await browser.fill('#business-phone', '123');
    await browser.click('.business-actions__submit');
    await browser.waitFor(
      `document.querySelector('.field__error')?.textContent.includes('10-digit')`,
      'business phone validation',
    );
    check('server validation returns to the exact invalid contact field', true);

    await browser.fill('#business-phone', '9876543210');
    await browser.click('.business-actions__submit');
    await browser.waitFor(
      `Boolean(
        document.querySelector('.business-success') ||
        document.querySelector('.business-form > .alert--error')
      )`,
      'business creation response',
      NAVIGATION_TIMEOUT,
    );
    const businessCreationError = await browser.evaluate(
      `document.querySelector('.business-form > .alert--error')?.textContent?.trim()`,
    );
    if (businessCreationError) {
      throw new Error(`Business creation returned an error: ${businessCreationError}`);
    }
    const manageHref = await browser.evaluate(
      `document.querySelector('.business-success a[href^="/business/manage/"]')?.getAttribute('href')`,
    );
    createdBusiness = (await api('/businesses/mine', { token })).find(
      (item) => item.name === businessName,
    );
    check(
      'creation reaches the API and offers a management destination',
      createdBusiness && manageHref === `/business/manage/${createdBusiness.id}`,
      manageHref,
    );
    check(
      'successful creation clears the recovered local draft',
      (await browser.evaluate(`localStorage.getItem(${JSON.stringify(draftKey)})`)) === null,
    );

    await browser.navigate('/dashboard?tab=businesses');
    await browser.waitFor(
      `Boolean(document.querySelector('.dashboard-businesses a[href="${manageHref}"]'))`,
      'business dashboard entry',
    );
    check(
      'the dashboard keeps a durable route back to business management',
      await browser.evaluate(
        `document.querySelector('.dashboard-businesses')?.textContent.includes(${JSON.stringify(businessName)})`,
      ),
    );

    await browser.navigate(manageHref);
    await browser.waitFor(
      `document.querySelector('.business-manager h1')?.textContent.includes(${JSON.stringify(businessName)})`,
      'business manager',
    );
    await browser.screenshot('business-manager-desktop.png');
    check(
      'owner workspace loads the newly created business',
      await browser.evaluate(
        `Boolean(document.querySelector('.business-manager-form')) &&
         !document.querySelector('[data-nextjs-dialog]')`,
      ),
    );
    const incompleteVerification = await fetch(
      `${API}/businesses/${createdBusiness.id}/verification-request`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    );
    check(
      'verification refuses an incomplete profile',
      incompleteVerification.status === 400,
      `HTTP ${incompleteVerification.status}`,
    );
    await browser.fill('input[name="addressLine"]', 'Updated Acceptance Road, Local Centre');
    await browser.click('.business-manager-form__footer button[type="submit"]');
    await browser.waitFor(
      `Boolean(document.querySelector('.business-manager-saved'))`,
      'business profile save',
      15_000,
    );
    const updatedBusiness = await api(`/businesses/${createdBusiness.slug}`, { token });
    check(
      'management edits persist through the API',
      updatedBusiness.addressLine === 'Updated Acceptance Road, Local Centre',
      updatedBusiness.addressLine,
    );

    await browser.evaluate(
      `document.querySelector('.business-trust-panel')?.scrollIntoView({ block: 'center' })`,
    );
    await delay(300);
    await browser.screenshot('business-owner-trust-desktop.png');
    await browser.click('.business-trust-panel button[type="submit"]');
    await browser.waitFor(
      `Boolean(document.querySelector('.business-trust-waiting'))`,
      'verification request state',
      15_000,
    );
    const pendingBusiness = await api(`/businesses/${createdBusiness.slug}`, { token });
    check(
      'a complete owner profile can request verification',
      pendingBusiness.verificationStatus === 'PENDING',
      pendingBusiness.verificationStatus,
    );

    await browser.fill('.business-staff-add input[name="phone"]', '9000000004');
    await browser.click('.business-staff-add button[type="submit"]');
    await browser.waitFor(
      `Boolean(document.querySelector('.business-staff-list article'))`,
      'new business staff row',
      15_000,
    );
    let businessStaff = await api(`/businesses/${createdBusiness.id}/staff`, { token });
    check(
      'a new owner can grant role-based access without refreshing their token',
      businessStaff.length === 1 && businessStaff[0].role === 'EDITOR',
      businessStaff[0]?.role,
    );
    const sellerLogin = await api('/auth/login/email', {
      method: 'POST',
      body: {
        email: 'seller@locz.test',
        password: PASSWORD,
        device: {
          deviceKey: `browser-staff-forgery-${Date.now()}`,
          platform: 'WEB',
          name: 'Browser staff forgery check',
        },
      },
    });
    const forgedStaffChange = await fetch(`${API}/businesses/${createdBusiness.id}/staff`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sellerLogin.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: '+919000000007', role: 'MANAGER' }),
    });
    check(
      'a non-owner cannot grant themselves or others business access',
      forgedStaffChange.status === 403,
      `HTTP ${forgedStaffChange.status}`,
    );
    await browser.click('.business-staff-list__remove');
    check(
      'staff removal asks for an explicit second decision',
      await browser.evaluate(`Boolean(document.querySelector('.business-staff-remove'))`),
    );
    await browser.click('.business-staff-remove form button');
    await browser.waitFor(
      `!document.querySelector('.business-staff-list article')`,
      'staff access removal',
      15_000,
    );
    businessStaff = await api(`/businesses/${createdBusiness.id}/staff`, { token });
    check('confirmed staff removal reaches the API', businessStaff.length === 0);

    const adminLogin = await api('/auth/login/email', {
      method: 'POST',
      body: {
        email: 'admin@locz.test',
        password: PASSWORD,
        device: {
          deviceKey: `browser-admin-${Date.now()}`,
          platform: 'WEB',
          name: 'Browser admin acceptance',
        },
      },
    });
    await browser.setAdminSession(adminLogin);
    await browser.viewport(1365, 980);
    await browser.navigate('http://localhost:3001/businesses?status=PENDING');
    const reviewSelector = `[data-business-id="${createdBusiness.id}"]`;
    await browser.waitFor(
      `Boolean(document.querySelector(${JSON.stringify(reviewSelector)}))`,
      'admin verification review row',
      15_000,
    );
    await checkAccessibility(browser, 'admin review queue passes automated WCAG A/AA checks');
    await browser.screenshot('business-verification-admin.png');
    await browser.clickWithin(reviewSelector, 'button[value="VERIFIED"]');
    await waitUntil(
      async () =>
        (await api(`/businesses/${createdBusiness.slug}`, { token })).verificationStatus ===
        'VERIFIED',
      'admin verification decision',
      15_000,
    );
    const verifiedBusiness = await api(`/businesses/${createdBusiness.slug}`, { token });
    check(
      'administrator verification updates the public trust signal',
      verifiedBusiness.verificationStatus === 'VERIFIED',
      verifiedBusiness.verificationStatus,
    );
    const ownerNotifications = await api('/notifications?limit=20', { token });
    check(
      'the owner receives the verification decision',
      ownerNotifications.items.some(
        (notification) =>
          notification.type === 'BUSINESS_VERIFICATION_UPDATE' &&
          notification.data?.entityId === createdBusiness.id,
      ),
    );

    // ------------------------------------------------ restricted safety console
    step('8. Restricted safety-console workflow');
    check(
      'wildcard administrator does not receive the safety navigation',
      !(await browser.evaluate(
        `Array.from(document.querySelectorAll('a')).some(
          (link) => link.getAttribute('href') === '/safety'
        )`,
      )),
    );

    safetyFixture = await createSyntheticSafetyCase();
    const officerLogin = await api('/auth/login/email', {
      method: 'POST',
      body: {
        email: 'childsafety@locz.test',
        password: PASSWORD,
        device: {
          deviceKey: safetyFixture.deviceKey,
          platform: 'WEB',
          name: 'Safety browser acceptance',
        },
      },
    });
    await browser.setAdminSession(officerLogin);
    await browser.navigate('http://localhost:3001/safety');
    const safetyCaseSelector = `[href="/safety/${safetyFixture.caseId}"]`;
    await browser.waitFor(
      `Boolean(document.querySelector(${JSON.stringify(safetyCaseSelector)}))`,
      'synthetic case in restricted safety queue',
      15_000,
    );
    check(
      'safety-only officer sees the case but not ordinary moderation',
      await browser.evaluate(
        `Boolean(document.querySelector(${JSON.stringify(safetyCaseSelector)})) &&
         !Array.from(document.querySelectorAll('a')).some(
           (link) => link.getAttribute('href') === '/moderation'
         )`,
      ),
    );
    await checkAccessibility(browser, 'restricted safety queue passes automated WCAG A/AA checks');

    await browser.click(safetyCaseSelector);
    await browser.waitFor(
      `document.querySelector('[data-safety-status]')?.dataset.safetyStatus === 'OPEN'`,
      'open safety case detail',
      15_000,
    );
    check(
      'case detail conceals evidence by default',
      !(await browser.evaluate(`Boolean(document.querySelector('.safety-preview-link'))`)),
    );
    await checkAccessibility(browser, 'open safety case passes automated WCAG A/AA checks');
    await browser.screenshot('safety-case-open.png');

    await browser.click('[data-safety-action="evidence"]');
    await browser.fill(
      '#evidence-justification',
      'Synthetic browser verification of the deliberate audited evidence gate',
    );
    await browser.click('.safety-action-form--evidence button[type="submit"]');
    await browser.waitFor(
      `Boolean(document.querySelector('.safety-preview-link'))`,
      'audited evidence preview link',
      15_000,
    );
    check(
      'evidence remains behind a second deliberate click',
      await browser.evaluate(
        `document.querySelector('.safety-preview-link')?.getAttribute('target') === '_blank'`,
      ),
    );

    await browser.click('[data-safety-action="report"]');
    await browser.fill('#report-reference', `SYNTHETIC-BROWSER-${safetyFixture.caseId}`);
    await browser.fill(
      '#report-justification',
      'Synthetic local browser verification; no external report or illegal material involved',
    );
    await browser.click('.safety-action-form button[type="submit"]');
    await browser.waitFor(
      `document.querySelector('[data-safety-status]')?.dataset.safetyStatus === 'REPORTED'`,
      'reported safety status',
      15_000,
    );

    await browser.click('[data-safety-action="close"]');
    await browser.fill(
      '#close-justification',
      'Synthetic browser verification completed with all restricted transitions exercised',
    );
    await browser.click('.safety-action-form button[type="submit"]');
    await browser.waitFor(
      `document.querySelector('[data-safety-status]')?.dataset.safetyStatus === 'CLOSED'`,
      'closed safety status',
      15_000,
    );
    const safetyState = await safetyFixture.db.query(
      `select c.status, m.status as "mediaStatus", count(a.id)::int as "auditCount"
       from media_safety_cases c
       join listing_media m on m.id = c."mediaId"
       left join media_safety_access_logs a on a."caseId" = c.id
       where c.id = $1
       group by c.status, m.status`,
      [safetyFixture.caseId],
    );
    check(
      'browser actions persist closure, legal hold and named audit events',
      safetyState.rows[0]?.status === 'CLOSED' &&
        safetyState.rows[0]?.mediaStatus === 'LEGAL_HOLD' &&
        safetyState.rows[0]?.auditCount >= 4,
      JSON.stringify(safetyState.rows[0]),
    );
    await browser.screenshot('safety-case-closed.png');

    await browser.setSession(login);
    await browser.viewport(430, 920);
    await browser.navigate(manageHref);
    await browser.screenshot('business-manager-mobile.png');
    await browser.evaluate(
      `document.querySelector('.business-trust-panel')?.scrollIntoView({ block: 'start' })`,
    );
    await delay(300);
    await browser.screenshot('business-owner-trust-mobile.png');
    check(
      'business manager stays within the mobile viewport',
      await browser.evaluate(
        `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
      ),
    );

    check(
      'browser emitted no runtime errors',
      browser.errors.length === 0,
      browser.errors.join(' | '),
    );
  } finally {
    if (listing?.id) {
      await api(`/listings/${listing.id}/save`, { method: 'DELETE', token }).catch(() => undefined);
    }
    if (createdBusiness) {
      try {
        await api(`/businesses/${createdBusiness.id}`, { method: 'DELETE', token });
        const activeBusinesses = await api('/businesses/mine', { token });
        check(
          'business fixture is absent from the owner active records after cleanup',
          !activeBusinesses.some((item) => item.id === createdBusiness.id),
        );
      } catch (error) {
        check('business fixture is absent from the owner active records after cleanup', false);
        console.error(`Business fixture cleanup failed: ${error.message}`);
      }
    }
    await cleanupSyntheticSafetyCase(safetyFixture).catch((error) => {
      console.error(`Safety fixture cleanup failed: ${error.message}`);
      process.exitCode = 1;
    });
    await cleanupPublicFixtures(token, publicFixture);
    browser.close();
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`\nBrowser acceptance run aborted: ${error.message}`);
    process.exitCode = 1;
  });
}
