import 'server-only';
import { LoczApiError, LoczClient } from '@locz/api-client';
import type { ApiResponse, AuthSession } from '@locz/shared-types';
import { cookies } from 'next/headers';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  USER_COOKIE,
  getAccessToken,
  getRefreshToken,
} from './session';

const API_BASE = process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL ?? 'http://localhost:4000/api/v1';

/**
 * The shared SDK, configured for the console.
 *
 * The token is resolved per request from the httpOnly cookie rather than captured at
 * construction, so a refreshed token is picked up without rebuilding the client.
 */
export const locz = new LoczClient({
  baseUrl: API_BASE,
  getToken: () => getAccessToken(),
  // Moderation data is acted on immediately; a cached queue would show one moderator
  // listings a colleague has already handled.
  fetchOptions: { cache: 'no-store' },
});

/** Re-exported so pages can narrow on it without importing from two places. */
export { LoczApiError as ApiRequestError };

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  revalidate?: number;
  auth?: boolean;
}

/**
 * Escape hatch for endpoints the SDK does not wrap yet — the admin surface is broad and
 * a typed method for every metrics variant would be more code than it is worth. New
 * *shared* endpoints belong on the SDK; console-only ones can use this.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, revalidate, auth = true } = options;

  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(revalidate !== undefined ? { next: { revalidate } } : { cache: 'no-store' }),
    });
  };

  let token = auth ? await getAccessToken() : null;
  let response = await send(token);

  /**
   * One retry after refreshing, when the access token has expired.
   *
   * The console stored a refresh token and never used it, so a moderator was signed out
   * every fifteen minutes in the middle of a queue — and because the identity cookie lasts
   * thirty days, the sidebar kept showing their name while every panel failed to load.
   */
  if (auth && response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      token = refreshed;
      response = await send(token);
    }
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiResponse<T>) : null;

  if (!response.ok) {
    const error = payload && 'error' in payload ? payload.error : undefined;
    throw new LoczApiError(
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.code ?? 'RequestFailed',
    );
  }

  if (!payload) return undefined as T;
  return 'data' in payload ? payload.data : (payload as unknown as T);
}

/** Unauthenticated call — used only by the sign-in form. */
export async function apiPublic<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body, auth: false });
}

/**
 * Exchanges the refresh token for a new pair and writes both cookies.
 *
 * Refresh tokens rotate on every use and presenting a used one revokes the whole family, so
 * this runs only after a 401 and never speculatively. Cookie writes are only possible inside
 * a Server Action or Route Handler; during a page render the rotated token is still used for
 * the request in flight and the cookie catches up on the next action.
 */
async function refreshSession(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  let session: AuthSession;
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!response.ok) {
      await forgetSession();
      return null;
    }

    const payload = (await response.json()) as ApiResponse<AuthSession>;
    if (!('data' in payload)) {
      await forgetSession();
      return null;
    }
    session = payload.data;
  } catch {
    // Unreachable API is not an ended session, so nothing is cleared.
    return null;
  }

  const secure = process.env.NODE_ENV === 'production';
  try {
    const jar = await cookies();
    jar.set(ACCESS_COOKIE, session.tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 15,
    });
    jar.set(REFRESH_COOKIE, session.tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  } catch {
    // Read-only cookie store during a page render.
  }

  return session.tokens.accessToken;
}

async function forgetSession(): Promise<void> {
  try {
    const jar = await cookies();
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) jar.delete(name);
  } catch {
    // As above.
  }
}
