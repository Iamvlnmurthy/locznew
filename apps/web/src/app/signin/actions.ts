'use server';

import { redirect } from 'next/navigation';
import type { AuthSession } from '@locz/shared-types';
import { api, ApiError } from '@/lib/api';
import { browserDeviceKey } from '@/lib/device';
import { storeSession } from '@/lib/session';

export interface SignInState {
  step: 'phone' | 'code';
  phone?: string;
  /** Kept across a failed attempt so the address is not retyped. */
  email?: string;
  error?: string;
  /** Present only when the API runs the mock OTP provider (development). */
  devCode?: string;
}

export interface GoogleSignInState {
  error?: 'unavailable' | 'failed';
}

/** 10 digits, first digit 6–9 — the Indian mobile range. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export async function requestCodeAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const raw = String(formData.get('phone') ?? '').replace(/\D/g, '');
  const national = raw.startsWith('91') && raw.length === 12 ? raw.slice(2) : raw;

  if (!INDIAN_MOBILE.test(national)) {
    return { step: 'phone', error: 'invalidPhone' };
  }

  const phone = `+91${national}`;

  try {
    const result = await api<{ expiresInSeconds: number; debugCode?: string }>(
      '/auth/otp/request',
      { method: 'POST', body: { phone } },
    );
    return { step: 'code', phone, devCode: result.debugCode };
  } catch (error) {
    return { step: 'phone', error: error instanceof Error ? error.message : 'error' };
  }
}

/**
 * Signs in with a mobile number and a password.
 *
 * The one-time-code flow is still implemented above and still works, but nothing in the
 * interface reaches it: with no SMS gateway the codes were a shared PIN, which authenticates
 * knowledge of four digits rather than ownership of a number. Passwords give each person a
 * credential of their own. When a real SMS provider is configured the code path can be shown
 * again — it is deliberately left intact rather than deleted for that reason.
 */
export async function passwordSignInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  // Deliberately loose. Anything stricter rejects addresses that genuinely work, and the
  // server is the only place that can actually say whether this one has an account.
  if (!email.includes('@') || email.length < 5) return { step: 'phone', error: 'invalidEmail' };
  if (!password) return { step: 'phone', email, error: 'missingPassword' };

  const deviceKey = await browserDeviceKey(String(formData.get('deviceKey') ?? ''));

  let session: AuthSession;
  try {
    session = await api<AuthSession>('/auth/login/email', {
      method: 'POST',
      body: {
        email,
        password,
        device: { deviceKey, platform: 'WEB', name: 'Web browser' },
      },
    });
  } catch {
    // The API answers the same way for an unknown address and a wrong password, so the
    // interface must not invent a distinction the server deliberately refuses to make.
    // The thrown message is deliberately discarded for the same reason.
    return { step: 'phone', email, error: 'badCredentials' };
  }

  await storeSession(session);
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

/**
 * Exchanges Google's short-lived credential for the same LocZ session used by every
 * other sign-in path. This stays server-side so neither LocZ token is exposed to browser
 * JavaScript; `storeSession` writes the existing httpOnly cookies.
 *
 * Google now creates the account when the verified address has none, so there is no longer
 * an `accountRequired` outcome — the button used to fail here and tell the reader to go
 * and fill in the form instead, which on the sign-up page was a circular dead end.
 */
export async function googleSignInAction(
  _prev: GoogleSignInState,
  formData: FormData,
): Promise<GoogleSignInState> {
  const idToken = String(formData.get('idToken') ?? '');
  const next = String(formData.get('next') ?? '/');
  if (!idToken) return { error: 'failed' };

  const deviceKey = await browserDeviceKey(String(formData.get('deviceKey') ?? ''));

  let session: AuthSession;
  try {
    session = await api<AuthSession>('/auth/login/google', {
      method: 'POST',
      body: {
        idToken,
        device: { deviceKey, platform: 'WEB', name: 'Web browser' },
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return { error: 'unavailable' };
    return { error: 'failed' };
  }

  await storeSession(session);

  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  // A brand-new Google account has no mobile number, and on a marketplace where buyers ring
  // sellers that is the one thing worth asking for immediately. Sent there with `next` intact
  // so the person still lands where they were going once the number is confirmed — and the
  // page itself is skippable, so this directs rather than traps.
  if (session.user.requiresPhone) {
    redirect(`/account/phone?next=${encodeURIComponent(destination)}`);
  }

  redirect(destination);
}

export async function verifyCodeAction(
  prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const phone = String(formData.get('phone') ?? prev.phone ?? '');
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  const displayName = String(formData.get('displayName') ?? '').trim();
  const submittedDeviceKey = String(formData.get('deviceKey') ?? '').trim();
  const next = String(formData.get('next') ?? '/');

  if (!phone) return { step: 'phone', error: 'invalidPhone' };
  if (code.length < 4) return { step: 'code', phone, error: 'Enter the code we sent you' };

  let session: AuthSession;
  try {
    session = await api<AuthSession>('/auth/otp/verify', {
      method: 'POST',
      body: {
        phone,
        code,
        // The client persists one random identifier per browser. The fallback keeps
        // non-browser clients compatible without accepting an unbounded value.
        device: {
          deviceKey: await browserDeviceKey(submittedDeviceKey),
          platform: 'WEB',
          name: 'Web browser',
        },
        displayName: displayName.length >= 2 ? displayName.slice(0, 120) : undefined,
      },
    });
  } catch (error) {
    return { step: 'code', phone, error: error instanceof Error ? error.message : 'error' };
  }

  await storeSession(session);
  // Only same-origin paths are honoured, so `?next=` cannot be used as an open redirect.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}
