'use server';

import { redirect } from 'next/navigation';
import type { AuthSession } from '@locz/shared-types';
import { api } from '@/lib/api';
import { storeSession } from '@/lib/session';

export interface SignInState {
  step: 'phone' | 'code';
  phone?: string;
  error?: string;
  /** Present only when the API runs the mock OTP provider (development). */
  devCode?: string;
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

export async function verifyCodeAction(
  prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const phone = String(formData.get('phone') ?? prev.phone ?? '');
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
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
        // A stable per-browser key so signing in again replaces the device record
        // instead of accumulating one per visit.
        device: { deviceKey: `web-${phone}`, platform: 'WEB', name: 'Web browser' },
      },
    });
  } catch (error) {
    return { step: 'code', phone, error: error instanceof Error ? error.message : 'error' };
  }

  await storeSession(session);
  // Only same-origin paths are honoured, so `?next=` cannot be used as an open redirect.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}
