'use server';

import { redirect } from 'next/navigation';
import type { AuthSession } from '@locz/shared-types';
import { api } from '@/lib/api';
import { storeSession } from '@/lib/session';

export interface RegisterState {
  error?: string;
  /** Kept so a failed submission does not clear what the person already typed. */
  values?: { name?: string; phone?: string };
}

/** 10 digits, first digit 6–9 — the Indian mobile range. Mirrors the sign-in form. */
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Matches the API. Eight characters, not a menu of character-class rules: on a marketplace
 * used across three languages and a wide range of phones, a rule people cannot satisfy gets
 * met by writing the password down. The lockout on repeated failures is what actually
 * protects the account.
 */
const PASSWORD_MIN = 8;

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const name = String(formData.get('name') ?? '').trim();
  const raw = String(formData.get('phone') ?? '').replace(/\D/g, '');
  const national = raw.startsWith('91') && raw.length === 12 ? raw.slice(2) : raw;
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  // Everything the user typed is echoed back on every failure path, so a mistyped password
  // does not also cost them their name and number.
  const values = { name, phone: national };

  if (name.length < 2) return { error: 'invalidName', values };
  if (!INDIAN_MOBILE.test(national)) return { error: 'invalidPhone', values };
  if (password.length < PASSWORD_MIN) return { error: 'shortPassword', values };
  if (password !== confirm) return { error: 'passwordMismatch', values };

  let session: AuthSession;
  try {
    session = await api<AuthSession>('/auth/register', {
      method: 'POST',
      body: {
        phone: `+91${national}`,
        displayName: name,
        password,
        device: { deviceKey: `web-${Date.now()}`, platform: 'WEB', name: 'LocZ web' },
      },
    });
  } catch (error) {
    // The API answers 409 when the number already has an account, and that is worth saying
    // plainly rather than generically: the person can act on it by signing in instead.
    const message = error instanceof Error ? error.message : '';
    if (/already has an account/i.test(message)) return { error: 'phoneTaken', values };
    return { error: message || 'error', values };
  }

  await storeSession(session);
  redirect('/');
}
