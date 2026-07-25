import { cookies } from 'next/headers';
import type { ApiResponse } from '@locz/shared-types';

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

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(auth || revalidate === undefined
      ? { cache: 'no-store' as const }
      : { next: { revalidate, ...(tags ? { tags } : {}) } }),
  });

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
