'use server';

import { redirect } from 'next/navigation';
import type { AuthSession } from '@locz/shared-types';
import { ApiRequestError, apiPublic } from '@/lib/api';
import { clearSession, storeSession } from '@/lib/session';

export interface LoginState {
  error?: string;
  /**
   * Where to go on success, for callers that cannot use `redirect()`.
   *
   * A server action invoked from a click handler rather than a form cannot redirect: Next
   * signals redirects by throwing, and that signal is only acted on when the action runs
   * through a form or `useActionState`. Called directly it is swallowed and the page simply
   * sits there — which is exactly how the Google button failed.
   */
  redirectTo?: string;
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
  const result = await finishConsoleSignIn(session);
  if (result.error) return result;

  // This path runs through useActionState, so redirect() works and is the better exit.
  redirect(result.redirectTo ?? '/');
}

export async function googleLoginAction(idToken: string): Promise<LoginState> {
  let session: AuthSession;
  try {
    session = await apiPublic<AuthSession>('/auth/login/google', {
      idToken,
      device: {
        deviceKey: 'admin-console-google',
        platform: 'WEB',
        name: 'LocZ Admin Console',
      },
    });
  } catch (error) {
    if (error instanceof ApiRequestError) return { error: error.message };
    return { error: 'Could not reach the API. Is it running?' };
  }

  // Returned rather than redirected, because the caller is a click handler.
  return finishConsoleSignIn(session);
}

/** The console gate, shared by both sign-in paths so neither can drift from the other. */
async function finishConsoleSignIn(session: AuthSession): Promise<LoginState> {
  const canUseConsole =
    session.user.permissions.includes('*') ||
    session.user.permissions.includes('listing:moderate') ||
    session.user.permissions.includes('metrics:read') ||
    session.user.permissions.includes('safety:case:read');

  if (!canUseConsole) {
    return { error: 'This account does not have access to the admin console' };
  }

  await storeSession(session);

  const safetyOnly =
    session.user.permissions.includes('safety:case:read') &&
    !session.user.permissions.includes('*') &&
    !session.user.permissions.includes('metrics:read') &&
    !session.user.permissions.includes('listing:moderate');

  return { redirectTo: safetyOnly ? '/safety' : '/' };
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/login');
}
