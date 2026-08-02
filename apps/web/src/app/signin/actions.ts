'use server';

import { redirect } from 'next/navigation';
import type { AuthSession } from '@locz/shared-types';
import { api, ApiError } from '@/lib/api';
import { storeSession } from '@/lib/session';

export interface SignInState {
  step: 'phone' | 'code';
  phone?: string;
  error?: string;
  /** Present only when the API runs the mock OTP provider (development). */
  devCode?: string;
}

export interface GoogleSignInState {
  error?: 'accountRequired' | 'unavailable' | 'failed';
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
  const raw = String(formData.get('phone') ?? '').replace(/\D/g, '');
  const national = raw.startsWith('91') && raw.length === 12 ? raw.slice(2) : raw;
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  if (!INDIAN_MOBILE.test(national)) return { step: 'phone', error: 'invalidPhone' };
  if (!password) return { step: 'phone', phone: national, error: 'missingPassword' };

  let session: AuthSession;
  try {
    session = await api<AuthSession>('/auth/login/phone', {
      method: 'POST',
      body: {
        phone: `+91${national}`,
        password,
        device: { deviceKey: `web-${Date.now()}`, platform: 'WEB', name: 'Web browser' },
      },
    });
  } catch {
    // The API answers the same way for an unknown number and a wrong password, so the
    // interface must not invent a distinction the server deliberately refuses to make.
    // The thrown message is deliberately discarded for the same reason.
    return { step: 'phone', phone: national, error: 'badCredentials' };
  }

  await storeSession(session);
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

/**
 * Exchanges Google's short-lived credential for the same LocZ session used by every
 * other sign-in path. This stays server-side so neither LocZ token is exposed to browser
 * JavaScript; `storeSession` writes the existing httpOnly cookies.
 */
export async function googleSignInAction(
  _prev: GoogleSignInState,
  formData: FormData,
): Promise<GoogleSignInState> {
  const idToken = String(formData.get('idToken') ?? '');
  const next = String(formData.get('next') ?? '/');
  if (!idToken) return { error: 'failed' };

  let session: AuthSession;
  try {
    session = await api<AuthSession>('/auth/login/google', {
      method: 'POST',
      body: {
        idToken,
        device: {
          deviceKey: `web-google-${Date.now()}`,
          platform: 'WEB',
          name: 'Web browser',
        },
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 503) return { error: 'unavailable' };
      if (error.status === 401 && /mobile number first|no locz account/i.test(error.message)) {
        return { error: 'accountRequired' };
      }
    }
    return { error: 'failed' };
  }

  await storeSession(session);
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
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
          deviceKey:
            submittedDeviceKey.length >= 8 && submittedDeviceKey.length <= 128
              ? submittedDeviceKey
              : `web-${phone}`,
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
