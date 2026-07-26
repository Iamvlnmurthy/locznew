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

/** Refresh rather than trust a token older than this. Access tokens live fifteen minutes. */
const TOKEN_REFRESH_AFTER_MS = 10 * 60 * 1000;

const CACHE_DIR = join(tmpdir(), 'locz-acceptance');
const CACHE_FILE = join(CACHE_DIR, 'sessions.json');
const PACE_FILE = join(CACHE_DIR, 'last-sign-in-at');

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

/**
 * The OTP endpoint allows five requests a minute from one address, which is the right
 * number for production: a person needs one code, occasionally two.
 *
 * A suite that opens seven accounts will trip it, and backing off after the fact means
 * waiting a full minute several times over. Spacing fresh sign-ins a little over twelve
 * seconds apart keeps the suite under the limit by construction instead — slower than
 * hammering, much faster than being throttled, and it leaves the limit itself alone.
 */
const MIN_GAP_BETWEEN_SIGN_INS_MS = 15_000;
// The route guard's window is 60 seconds. A standards-compliant response supplies
// Retry-After; this is only the conservative fallback for an older running API that does
// not. Eleven seconds repeatedly re-enters the same window and can prolong the block.
const ROUTE_THROTTLE_FALLBACK_SECONDS = 62;
let lastSignInAt = 0;

function readLastSignInAt() {
  if (!existsSync(PACE_FILE)) return 0;
  try {
    const timestamp = Number(readFileSync(PACE_FILE, 'utf8'));
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
}

function writeLastSignInAt(timestamp) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(PACE_FILE, String(timestamp), { mode: 0o600 });
}

async function pace(onWait) {
  // `acceptance:all` launches each suite as a separate process. Keeping this clock only
  // in memory lets every new suite believe it is first, so their first OTP requests bunch
  // together and trip the route's five-per-minute IP limit. The timestamp contains no
  // credential or phone number and lives beside the session cache in the OS temp folder.
  lastSignInAt = Math.max(lastSignInAt, readLastSignInAt());
  const wait = lastSignInAt + MIN_GAP_BETWEEN_SIGN_INS_MS - Date.now();
  if (wait > 0) {
    onWait?.(Math.ceil(wait / 1000));
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastSignInAt = Date.now();
  writeLastSignInAt(lastSignInAt);
}

/**
 * One code, requested and spent.
 *
 * Split out so a code that went stale can be abandoned and a new one requested, rather than
 * being submitted twice. See `freshSignIn`.
 */
/** Whole sign-in attempts, each with its own freshly requested code. */
const MAX_SIGN_IN_ATTEMPTS = 3;

/** Grows with each attempt, so a saturated bucket is given progressively longer to drain. */
const THROTTLE_BACKOFF_SECONDS = 30;

async function requestAndSpendCode(api, phone, deviceKey, onWait) {
  await pace(onWait);

  const request = async () =>
    fetch(`${api}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

  let response = await request();
  for (let attempt = 0; response.status === 429 && attempt < 8; attempt += 1) {
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

    const waitSeconds = seconds > 0 ? seconds + 2 : ROUTE_THROTTLE_FALLBACK_SECONDS;
    const waitMs = Math.min(Math.max(waitSeconds, 11), 360) * 1000;
    onWait?.(Math.round(waitMs / 1000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await request();
  }

  const requested = await response.json();
  const debugCode = requested?.data?.debugCode ?? requested?.debugCode;
  if (!debugCode) {
    throw new Error(`No debugCode for ${phone} (HTTP ${response.status}) — is OTP_PROVIDER=mock?`);
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
    const seconds = header > 0 ? header : hinted;
    const waitSeconds = seconds > 0 ? seconds + 2 : ROUTE_THROTTLE_FALLBACK_SECONDS;
    const waitMs = Math.min(Math.max(waitSeconds, 11), 360) * 1000;
    onWait?.(Math.round(waitMs / 1000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    verified = await verifyOnce();
  }

  const payload = await verified.json();
  return { ok: verified.ok, payload };
}

/**
 * A fresh sign-in, retrying once with a *new* code if the first one goes stale.
 *
 * The verify step is rate limited separately from the request step, so a suite can obtain a
 * code and then be told to wait before spending it. The waits are long — up to several
 * minutes when the shared per-IP ceiling is involved — and a one-time code does not survive
 * that. Re-submitting it afterwards is not a retry, it is a guess: the API answers
 * `Incorrect code. 4 attempt(s) remaining`, the suite aborts on what looks like a credential
 * problem, and a verify attempt has been spent on a code that could never have worked.
 *
 * Asking for a new code costs one more SMS in the mock provider and nothing in reality, which
 * is a better trade than a whole suite failing. Bounded at one retry so a genuinely wrong
 * credential still fails fast rather than looping.
 */
async function freshSignIn(api, phone, deviceKey, onWait) {
  for (let attempt = 0; ; attempt += 1) {
    const { ok, payload } = await requestAndSpendCode(api, phone, deviceKey, onWait);
    if (ok) return payload?.data ?? payload;

    const message = JSON.stringify(payload);
    const staleCode = /Incorrect code|expired|invalid code/i.test(message);
    // The inner loops already waited out several 429s. Reaching here means the shared
    // per-IP bucket is saturated rather than this phone being throttled — which is what a
    // machine running seven HTTP suites and three browser gates looks like. One more,
    // longer wait costs a minute; failing here costs the whole suite.
    const throttled = /TooManyRequests|ThrottlerException|Too Many Requests/i.test(message);

    if ((!staleCode && !throttled) || attempt >= MAX_SIGN_IN_ATTEMPTS - 1) {
      throw new Error(`Sign-in failed for ${phone}: ${message.slice(0, 200)}`);
    }

    if (staleCode) {
      onWait?.(0);
      console.log(
        `    (the code for ${phone} expired before it could be used — asking for another)`,
      );
    } else {
      const seconds = THROTTLE_BACKOFF_SECONDS * (attempt + 1);
      onWait?.(seconds);
      console.log(`    (the shared sign-in limit is saturated — waiting ${seconds}s)`);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
  }
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
    // An access token lasts fifteen minutes and a full suite now runs longer than that,
    // because sign-ins are paced to stay under the OTP limit. A token that is merely
    // *currently* valid is not good enough — it can expire between this check and the
    // assertion that uses it, which surfaces as a baffling 401 halfway through a run.
    // Anything past ten minutes is refreshed on the spot; refreshing costs no SMS and is
    // not rate limited.
    const age = Date.now() - (cached.obtainedAt ?? 0);
    if (age < TOKEN_REFRESH_AFTER_MS && (await stillValid(api, cached))) return cached;

    const refreshed = await refresh(api, cached);
    if (refreshed && (await stillValid(api, refreshed))) {
      refreshed.obtainedAt = Date.now();
      cache[key] = refreshed;
      writeCache(cache);
      return refreshed;
    }
  }

  const session = await freshSignIn(api, phone, deviceKey, onWait);
  session.obtainedAt = Date.now();
  cache[key] = session;
  writeCache(cache);
  return session;
}
