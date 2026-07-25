'use server';

import { redirect } from 'next/navigation';
import type { AuthSession } from '@locz/shared-types';
import { ApiRequestError, apiPublic } from '@/lib/api';
import { clearSession, storeSession } from '@/lib/session';

export interface LoginState {
  error?: string;
}

/**
 * Signs a staff member in with email and password. Ordinary users authenticate by OTP;
 * the console uses passwords so it is reachable without an SMS gateway.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Enter your email address and password' };
  }

  let session: AuthSession;
  try {
    session = await apiPublic<AuthSession>('/auth/login/email', {
      email,
      password,
      device: {
        deviceKey: `admin-console-${email}`,
        platform: 'WEB',
        name: 'LocZ Admin Console',
      },
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { error: error.message };
    }
    return { error: 'Could not reach the API. Is it running?' };
  }

  // Authorisation is still enforced on every API call; this check exists so someone
  // without console access gets a clear message instead of a wall of empty pages.
  const canUseConsole =
    session.user.permissions.includes('*') ||
    session.user.permissions.includes('listing:moderate') ||
    session.user.permissions.includes('metrics:read');

  if (!canUseConsole) {
    return { error: 'This account does not have access to the admin console' };
  }

  await storeSession(session);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/login');
}
