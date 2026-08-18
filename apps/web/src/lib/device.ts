import 'server-only';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

const DEVICE_COOKIE = 'locz_device';

/**
 * Identifies this browser to the API, stably.
 *
 * `web-${Date.now()}` was a fresh identifier on every sign-in, so the `devices` table grew a
 * row per login and "the devices signed in to your account" listed a dozen indistinguishable
 * "Web browser" entries for one person on one machine — which makes revoking the right one
 * impossible, and makes "log out of this device" revoke a session nobody is using. The OTP
 * path already persisted a key per browser; the password, Google and registration paths did
 * not, so they each minted one and threw it away.
 *
 * Not httpOnly and not a credential: it names an installation, not a person, and it holds
 * nothing secret. A visitor who clears their cookies gets a new device row, which is the
 * correct reading of what happened.
 *
 * Callers may pass a key the client already persisted; anything outside the API's accepted
 * length is ignored rather than trusted.
 */
export async function browserDeviceKey(submitted?: string): Promise<string> {
  const trimmed = submitted?.trim();
  if (trimmed && trimmed.length >= 8 && trimmed.length <= 128) return trimmed;

  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing && existing.length >= 8 && existing.length <= 128) return existing;

  const generated = `web-${randomUUID()}`;
  try {
    jar.set(DEVICE_COOKIE, generated, {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // Read-only cookie store during a page render. The key is still returned and used; the
    // next sign-in from a Server Action persists one.
  }
  return generated;
}
