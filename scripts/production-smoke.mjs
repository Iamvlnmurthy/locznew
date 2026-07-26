#!/usr/bin/env node

const site = (process.env.LOCZ_PRODUCTION_URL ?? 'https://locz.in').replace(/\/$/, '');
const admin = (process.env.LOCZ_ADMIN_URL ?? 'https://admin.locz.in').replace(/\/$/, '');
const api = (process.env.LOCZ_API_URL ?? `${site}/api/v1`).replace(/\/$/, '');
const adminEmail = process.env.LOCZ_SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.LOCZ_SMOKE_ADMIN_PASSWORD;
const maxIndexDrift = Number(process.env.LOCZ_SMOKE_MAX_INDEX_DRIFT ?? '0');

const failures = [];
const passes = [];
let accessToken;

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function jsonData(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!payload || payload.success !== true || !('data' in payload)) {
    throw new Error('response did not match the LocZ API envelope');
  }
  return { response, data: payload.data };
}

async function check(label, action) {
  try {
    await action();
    pass(label);
  } catch (error) {
    fail(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await check('public site is served with production security headers', async () => {
  const response = await fetchWithTimeout(site, { headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.headers.get('strict-transport-security')?.includes('max-age=')) {
    throw new Error('Strict-Transport-Security is missing');
  }
  if (response.headers.get('x-content-type-options') !== 'nosniff') {
    throw new Error('X-Content-Type-Options is missing');
  }
});

await check('API liveness probe is healthy', async () => {
  const { data } = await jsonData(`${api}/health/live`);
  if (data.status !== 'ok') throw new Error(`status is ${data.status ?? 'unknown'}`);
});

await check('API readiness confirms PostgreSQL and Redis', async () => {
  const { data } = await jsonData(`${api}/health/ready`);
  if (data.status !== 'ok' || !data.checks?.database || !data.checks?.redis) {
    throw new Error('one or more readiness dependencies are unavailable');
  }
});

await check('keyword search is using Meilisearch', async () => {
  const { data } = await jsonData(`${api}/search?q=shop&limit=1`);
  if (data.usedSearchIndex !== true) {
    throw new Error('search fell back to PostgreSQL');
  }
});

await check('production API documentation is not published', async () => {
  const response = await fetchWithTimeout(`${site}/api/docs`, {
    redirect: 'manual',
    headers: { Accept: 'text/html' },
  });
  if (response.status >= 200 && response.status < 400) {
    throw new Error(`documentation returned HTTP ${response.status}`);
  }
});

await check('admin host is private to browsers and search engines', async () => {
  const response = await fetchWithTimeout(`${admin}/login`, {
    headers: { Accept: 'text/html' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.headers.get('x-robots-tag')?.includes('noindex')) {
    throw new Error('X-Robots-Tag noindex is missing');
  }
  if (response.headers.get('x-frame-options') !== 'DENY') {
    throw new Error('X-Frame-Options DENY is missing');
  }
});

if (!adminEmail || !adminPassword) {
  fail('admin index drift check: LOCZ_SMOKE_ADMIN_EMAIL and LOCZ_SMOKE_ADMIN_PASSWORD are required');
} else {
  await check('admin session can inspect a synchronized search index', async () => {
    const { data: session } = await jsonData(`${api}/auth/login/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        device: {
          deviceKey: `production-smoke-${Date.now()}`,
          platform: 'WEB',
          name: 'Production smoke gate',
        },
      }),
    });
    accessToken = session.tokens.accessToken;

    const { data: status } = await jsonData(`${api}/search/index/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!status.available) throw new Error('Meilisearch reports unavailable');
    if (typeof status.drift !== 'number' || status.drift > maxIndexDrift) {
      throw new Error(`index drift ${status.drift} exceeds allowed ${maxIndexDrift}`);
    }
  });
}

if (accessToken) {
  await check('smoke-test session is logged out', async () => {
    const response = await fetchWithTimeout(`${api}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status !== 204) throw new Error(`expected HTTP 204, received ${response.status}`);
  });
}

console.log(`LocZ production smoke — ${site}`);
for (const message of passes) console.log(`  PASS  ${message}`);
for (const message of failures) console.log(`  FAIL  ${message}`);
console.log(`\n${passes.length} passed, ${failures.length} failed`);

process.exitCode = failures.length > 0 ? 1 : 0;
