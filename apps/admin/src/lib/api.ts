import 'server-only';
import { LoczApiError, LoczClient } from '@locz/api-client';
import type { ApiResponse } from '@locz/shared-types';
import { getAccessToken } from './session';

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

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(revalidate !== undefined ? { next: { revalidate } } : { cache: 'no-store' }),
  });

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
