/**
 * A session cache shared by every acceptance suite.
 *
 * Why this exists: sign-in is rate limited per phone number, deliberately and correctly —
 * a few requests, then a lockout measured in minutes. The suites all sign in as the same
 * seeded staff accounts, so running them back to back tripped that limiter and left a run
 * sitting in a backoff loop for half an hour.
 *
 * Relaxing the limiter to make the tests pass would be the wrong trade: it protects real
 * users from SMS-bombing. So the suites now behave like a real client instead — sign in
 * once, keep the session, reuse it until it stops working. The cache lives in the system
 * temp directory rather than the repository, because it holds live tokens.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CACHE_DIR = join(tmpdir(), 'locz-acceptance');
const CACHE_FILE = join(CACHE_DIR, 'sessions.json');

function readCache() {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    // A corrupt cache is not worth a failed run — start over.
    return {};
  }
}

function writeCache(cache) {
  mkdirSync(CACHE_DIR, { recursive: true });
  // Tokens are credentials: readable by this user only, and never inside the repository.
  writeFileSync(CACHE_FILE, JSON.stringify(cache), { mode: 0o600 });
}

/** Does this access token still work? Cheaper than a sign-in, and the only real test. */
async function stillValid(api, session) {
  try {
    const response = await fetch(`${api}/users/me`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Exchanges a refresh token for a new access token — no SMS, no rate limit. */
async function refresh(api, session) {
  try {
    const response = await fetch(`${api}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const tokens = payload?.data?.tokens ?? payload?.tokens;
    return tokens ? { ...session, tokens } : null;
  } catch {
    return null;
  }
}

/**
 * Longer than this and waiting is the wrong answer.
 *
 * The IP-wide OTP ceiling resets after an hour, so a suite that obeyed its Retry-After
 * would sit silent for most of that — indistinguishable from a hang. Better to stop and
 * say which limit was hit and what to do about it.
 */
const MAX_SENSIBLE_WAIT_SECONDS = 180;

async function freshSignIn(api, phone, deviceKey, onWait) {
  const request = async () =>
    fetch(`${api}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

  let response = await request();
  for (let attempt = 0; response.status === 429 && attempt < 4; attempt += 1) {
    const body = await response.clone().text();
    const header = Number(response.headers.get('retry-after') ?? 0);
    const hinted = Number(/try again in (\d+) seconds/i.exec(body)?.[1] ?? 0);
    const seconds = header > 0 ? header : hinted;

    if (seconds > MAX_SENSIBLE_WAIT_SECONDS) {
      throw new Error(
        `Sign-in is rate limited for ${seconds}s — almost certainly the IP-wide OTP ceiling ` +
          '(OTP_MAX_REQUESTS_PER_PHONE_PER_WINDOW × 10 per hour, counted per source address). ' +
          'Every suite and browser test on this machine shares that one bucket. Raise the ' +
          'limit in your local .env, or wait for the window to reset.',
      );
    }

    const waitMs = Math.min(Math.max(seconds + 2, 11), 360) * 1000;
    onWait?.(Math.round(waitMs / 1000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await request();
  }

  const requested = await response.json();
  const debugCode = requested?.data?.debugCode ?? requested?.debugCode;
  if (!debugCode) {
    throw new Error(
      `No debugCode for ${phone} (HTTP ${response.status}) — is OTP_PROVIDER=mock?`,
    );
  }

  // The verify step has its own limit, and the code expires — so it is retried on 429
  // exactly like the request was. Getting a code and then being unable to spend it is
  // the most annoying possible way for a suite to fail.
  const verifyOnce = async () =>
    fetch(`${api}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        code: debugCode,
        device: { deviceKey, platform: 'WEB', name: 'Acceptance run' },
      }),
    });

  let verified = await verifyOnce();
  for (let attempt = 0; verified.status === 429 && attempt < 4; attempt += 1) {
    const body = await verified.clone().text();
    const header = Number(verified.headers.get('retry-after') ?? 0);
    const hinted = Number(/try again in (\d+) seconds/i.exec(body)?.[1] ?? 0);
    const waitMs = Math.min(Math.max((header > 0 ? header : hinted) + 2, 11), 360) * 1000;
    onWait?.(Math.round(waitMs / 1000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    verified = await verifyOnce();
  }

  const payload = await verified.json();
  if (!verified.ok) {
    throw new Error(`Sign-in failed for ${phone}: ${JSON.stringify(payload).slice(0, 200)}`);
  }

  return payload?.data ?? payload;
}

/**
 * A working session for `phone`, reusing a cached one when possible.
 *
 * Order of preference: a cached token that still works, then a refresh (no SMS, no rate
 * limit), then a real sign-in. Only the last one can be throttled, and it is the rare
 * path once the cache is warm.
 */
export async function getSession(api, phone, deviceKey, { onWait } = {}) {
  const cache = readCache();
  // Keyed on the phone alone, not the device: the suites use different device keys for
  // readability, but a second device means a second sign-in and the limiter counts by
  // phone. One live session per account is what a real user has, and what the limiter is
  // shaped for.
  const key = `${api}|${phone}`;
  // Any entry for this account will do, whatever device it was opened on — a usable
  // session is worth more than an exact key match, and a needless sign-in is the one
  // thing the limiter punishes.
  const cached =
    cache[key] ?? cache[Object.keys(cache).find((entry) => entry.startsWith(`${key}|`)) ?? ''];

  if (cached) {
    if (await stillValid(api, cached)) return cached;

    const refreshed = await refresh(api, cached);
    if (refreshed && (await stillValid(api, refreshed))) {
      cache[key] = refreshed;
      writeCache(cache);
      return refreshed;
    }
  }

  const session = await freshSignIn(api, phone, deviceKey, onWait);
  cache[key] = session;
  writeCache(cache);
  return session;
}
