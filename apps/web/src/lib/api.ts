import { cookies } from 'next/headers';
import type { ApiResponse, AuthSession } from '@locz/shared-types';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const ACCESS_COOKIE = 'locz_access';
export const REFRESH_COOKIE = 'locz_refresh';
export const USER_COOKIE = 'locz_user';
export const CITY_COOKIE = 'locz_city';
export const LOCALE_COOKIE = 'locz_locale';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Seconds of ISR caching. Public listing pages use this; anything personal must not. */
  revalidate?: number;
  auth?: boolean;
  tags?: string[];
}

/**
 * Server-side API client.
 *
 * Public reads are cached with ISR so listing and category pages are fast and
 * crawlable; anything that depends on who is asking passes `auth: true`, which forces
 * `no-store` — a cached page must never leak one user's saved state to another.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, revalidate, auth = false, tags } = options;

  const send = async (token: string | undefined): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(auth || revalidate === undefined
        ? { cache: 'no-store' as const }
        : { next: { revalidate, ...(tags ? { tags } : {}) } }),
    });
  };

  let token = auth ? await readCookie(ACCESS_COOKIE) : undefined;
  let response = await send(token);

  /**
   * One retry after refreshing, when the access token has expired.
   *
   * The access cookie lives fifteen minutes and the user cookie thirty days, and nothing here
   * ever exchanged the refresh token — so after a quarter of an hour the header still rendered
   * as signed in while every authenticated call came back 401. On pages that use `apiSafe`
   * that surfaced as an empty state rather than as a sign-in prompt, which is why it read as
   * "there is nothing here" instead of "you are signed out". The Flutter client has always
   * done this; the web never did.
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
    throw new ApiError(
      error?.message ?? `Request failed (${response.status})`,
      response.status,
      error?.code ?? 'RequestFailed',
    );
  }

  if (!payload) return undefined as T;
  return 'data' in payload ? payload.data : (payload as unknown as T);
}

/** Returns null instead of throwing — for optional panels that must not break a page. */
export async function apiSafe<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
  try {
    return await api<T>(path, options);
  } catch {
    return null;
  }
}

async function readCookie(name: string): Promise<string | undefined> {
  return (await cookies()).get(name)?.value;
}

/**
 * Exchanges the refresh token for a new pair and writes both cookies.
 *
 * Returns the new access token, or null when the session is genuinely over — in which case the
 * identity cookie is cleared too, so the interface stops claiming a session that no longer
 * exists rather than showing a signed-in header above signed-out data.
 *
 * Refresh tokens rotate on every use and presenting a used one revokes the whole family, so
 * this must not be called speculatively. It runs only after a 401.
 *
 * Cookie writes are not possible during a plain page render — Next only allows them in a
 * Server Action or a Route Handler. When that is where we are, the new token is still returned
 * and used for the current request; the cookie catches up on the next action the user takes.
 */
async function refreshSession(): Promise<string | null> {
  const refreshToken = await readCookie(REFRESH_COOKIE);
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
    // The API being unreachable is not the same as the session being over, so nothing is
    // cleared here — the caller sees the original 401 and the next request tries again.
    return null;
  }

  await writeSessionCookies(session);
  return session.tokens.accessToken;
}

/**
 * Writes the rotated pair back.
 *
 * Lives here rather than in `session.ts` to keep that module free of `api.ts` — the two would
 * otherwise import each other.
 */
async function writeSessionCookies(session: AuthSession): Promise<void> {
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
    // Read-only cookie store: this render is a page, not an action. The rotated token is
    // still used for the request in flight.
  }
}

async function forgetSession(): Promise<void> {
  try {
    const jar = await cookies();
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) jar.delete(name);
  } catch {
    // As above — nothing can be written during a page render.
  }
}
