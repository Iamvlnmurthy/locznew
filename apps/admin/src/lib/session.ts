import 'server-only';
import { cookies } from 'next/headers';
import type { AuthSession, AuthUser } from '@locz/shared-types';

const ACCESS_COOKIE = 'locz_admin_access';
const REFRESH_COOKIE = 'locz_admin_refresh';
const USER_COOKIE = 'locz_admin_user';

/**
 * Session storage for the admin console.
 *
 * Tokens live in httpOnly cookies, never in localStorage: the console renders
 * unmoderated user content, so any XSS slip must not be able to read a moderator's
 * credentials. Every API call is made server-side, so the browser never holds a token
 * at all.
 */
const secureCookie = process.env.NODE_ENV === 'production';

export async function storeSession(session: AuthSession): Promise<void> {
  const jar = await cookies();

  jar.set(ACCESS_COOKIE, session.tokens.accessToken, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 15,
  });

  jar.set(REFRESH_COOKIE, session.tokens.refreshToken, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  // Display-only identity. Readable by the server for rendering; it carries no
  // credential, so authorisation is never decided from it — the API re-checks every call.
  jar.set(USER_COOKIE, JSON.stringify(toDisplayUser(session.user)), {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

function toDisplayUser(user: AuthUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email ?? null,
    roles: user.roles,
    permissions: user.permissions,
  };
}

export type DisplayUser = ReturnType<typeof toDisplayUser>;

export async function getAccessToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  return (await cookies()).get(REFRESH_COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<DisplayUser | null> {
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DisplayUser;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) {
    jar.delete(name);
  }
}

/** Convenience for rendering — the API remains the authority on every request. */
export function hasPermission(user: DisplayUser | null, permission: string): boolean {
  if (!user) return false;
  // Child-safety access is explicit even for a super administrator. This mirrors the
  // API guard: a wildcard must never turn a platform credential into evidence access.
  if (permission.startsWith('safety:')) return user.permissions.includes(permission);
  return user.permissions.includes('*') || user.permissions.includes(permission);
}
