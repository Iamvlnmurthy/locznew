import 'server-only';
import type { ApiResponse } from '@locz/shared-types';
import { getAccessToken } from './session';

const API_BASE = process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Seconds to cache. Omit for no caching — the default for anything a moderator acts on. */
  revalidate?: number;
  auth?: boolean;
}

/**
 * Server-side API client. Every call runs on the Next.js server, so the access token
 * stays in an httpOnly cookie and never reaches the browser.
 *
 * The API wraps responses in `{ success, data }`; this unwraps that once so pages deal
 * in domain objects.
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
    // Moderation data is acted on immediately; serving a cached queue would show a
    // moderator listings a colleague has already handled.
    ...(revalidate !== undefined ? { next: { revalidate } } : { cache: 'no-store' }),
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiResponse<T>) : null;

  if (!response.ok) {
    const error = payload && 'error' in payload ? payload.error : undefined;
    throw new ApiRequestError(
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.code ?? 'RequestFailed',
      payload?.correlationId,
    );
  }

  // 204 No Content.
  if (!payload) return undefined as T;

  return 'data' in payload ? payload.data : (payload as unknown as T);
}

/** Unauthenticated call — used only by the sign-in form. */
export async function apiPublic<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body, auth: false });
}
