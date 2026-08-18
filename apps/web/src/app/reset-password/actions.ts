'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

export interface RequestResetState {
  error?: 'invalidEmail' | 'failed';
  /** Set once the request was accepted — the form switches to the "check your email" panel. */
  sent?: boolean;
  email?: string;
}

export interface CompleteResetState {
  error?: 'tooShort' | 'mismatch' | 'failed';
}

/** Matches the API's minimum, so the browser refuses what the server would refuse. */
const PASSWORD_MIN = 8;

/**
 * Asks for a reset link.
 *
 * The API answers the same way whether or not the address has an account, and so does this:
 * the success panel appears either way. A form that said "no such user" would be an account
 * enumeration tool, and on a marketplace that means learning who trades here.
 */
export async function requestResetAction(
  _prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  // Deliberately loose. Anything stricter rejects addresses that genuinely work, and only the
  // server can say whether this one has an account — which it will not say anyway.
  if (!email.includes('@') || email.length < 5) return { error: 'invalidEmail' };

  try {
    await api('/auth/password/reset/request', { method: 'POST', body: { email } });
  } catch {
    // Even a failure here is reported as sent. The alternative leaks whether the address
    // exists through the difference between the two outcomes.
  }

  return { sent: true, email };
}

/**
 * Sets the new password.
 *
 * On success the API has revoked every session on the account, so there is nothing to sign in
 * with here — the person is sent to the sign-in page to use the password they just chose.
 */
export async function completeResetAction(
  token: string,
  _prev: CompleteResetState,
  formData: FormData,
): Promise<CompleteResetState> {
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmPassword') ?? '');

  if (password.length < PASSWORD_MIN) return { error: 'tooShort' };
  if (password !== confirmation) return { error: 'mismatch' };

  try {
    await api('/auth/password/reset', { method: 'POST', body: { token, password } });
  } catch {
    // The API refuses an expired, used or unknown link with one message and never says which.
    return { error: 'failed' };
  }

  redirect('/signin?reset=done');
}
