import type {
  ApiResponse,
  AuthSession,
  Category,
  City,
  ListingSummary,
  ModerationQueueItem,
  Paginated,
  SearchIndexStatus,
} from '@locz/shared-types';

/**
 * Typed SDK for the LocZ API.
 *
 * Hand-written rather than generated from OpenAPI. The generated client for a Nest API
 * of this size is thousands of lines of near-identical wrappers, and every consumer here
 * is first-party — the value of generation is catching drift, which the shared
 * `@locz/shared-types` package already does at the type level.
 *
 * Regenerate the OpenAPI document (for external consumers or a future generated client)
 * with `npm run openapi -w @locz/api`.
 *
 * Transport is injected so the same client works in a Next.js server component (where
 * the token lives in an httpOnly cookie) and in a browser, without either knowing how
 * the other authenticates.
 */

export interface ClientOptions {
  baseUrl: string;
  /** Resolved per request so a rotated token is picked up without rebuilding the client. */
  getToken?: () => Promise<string | null> | string | null;
  /** Passed to fetch — Next.js caching directives, AbortSignal, and so on. */
  fetchOptions?: RequestInit & { next?: { revalidate?: number; tags?: string[] } };
  onUnauthorized?: () => void;
}

export class LoczApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'LoczApiError';
  }

  get isOffline(): boolean {
    return this.status === 0;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export class LoczClient {
  constructor(private readonly options: ClientOptions) {}

  private async request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, unknown> } = {},
  ): Promise<T> {
    const { query, ...rest } = init;

    const url = new URL(`${this.options.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      // Undefined and null are omitted rather than sent as the strings "undefined"/"null".
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers(rest.headers);
    headers.set('Content-Type', 'application/json');

    const token = await this.options.getToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(url, { ...this.options.fetchOptions, ...rest, headers });
    } catch (error) {
      throw new LoczApiError(
        error instanceof Error ? error.message : 'Network request failed',
        0,
        'NetworkError',
      );
    }

    if (response.status === 401) this.options.onUnauthorized?.();

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as ApiResponse<T>) : null;

    if (!response.ok) {
      const error = payload && 'error' in payload ? payload.error : undefined;
      throw new LoczApiError(
        error?.message ?? `Request failed (${response.status})`,
        response.status,
        error?.code ?? 'RequestFailed',
        error?.details,
      );
    }

    if (!payload) return undefined as T;
    return 'data' in payload ? payload.data : (payload as unknown as T);
  }

  // ---------------- Auth ----------------

  auth = {
    requestOtp: (phone: string) =>
      this.request<{ expiresInSeconds: number; debugCode?: string }>('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),

    verifyOtp: (input: {
      phone: string;
      code: string;
      device: { deviceKey: string; platform: 'ANDROID' | 'IOS' | 'WEB'; name?: string };
    }) =>
      this.request<AuthSession>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    loginWithEmail: (input: {
      email: string;
      password: string;
      device: { deviceKey: string; platform: 'ANDROID' | 'IOS' | 'WEB' };
    }) =>
      this.request<AuthSession>('/auth/login/email', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    refresh: (refreshToken: string) =>
      this.request<AuthSession>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),

    logout: () => this.request<void>('/auth/logout', { method: 'POST' }),
    logoutAll: () =>
      this.request<{ revokedSessions: number }>('/auth/logout/all', { method: 'POST' }),
  };

  // ---------------- Listings ----------------

  listings = {
    search: (query: Record<string, unknown>) =>
      this.request<{
        items: ListingSummary[];
        total: number;
        page: number;
        limit: number;
        usedSearchIndex: boolean;
      }>('/search', { query }),

    browse: (query: Record<string, unknown>) =>
      this.request<Paginated<ListingSummary>>('/listings', { query }),

    getBySlug: (slug: string) =>
      this.request<Record<string, unknown>>(`/listings/${encodeURIComponent(slug)}`),

    create: (body: Record<string, unknown>, idempotencyKey?: string) =>
      this.request<{ id: string; slug: string; status: string }>('/listings', {
        method: 'POST',
        body: JSON.stringify(body),
        // Guards against a double-tap on a flaky connection creating two identical ads.
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }),

    mine: (query: Record<string, unknown> = {}) =>
      this.request<Paginated<ListingSummary>>('/listings/mine', { query }),

    saved: (query: Record<string, unknown> = {}) =>
      this.request<Paginated<ListingSummary>>('/listings/saved', { query }),

    save: (id: string) =>
      this.request<{ saved: boolean; saveCount: number }>(`/listings/${id}/save`, {
        method: 'POST',
      }),

    unsave: (id: string) =>
      this.request<{ saved: boolean; saveCount: number }>(`/listings/${id}/save`, {
        method: 'DELETE',
      }),

    command: (id: string, command: 'pause' | 'resume' | 'sold' | 'republish' | 'submit') =>
      this.request<{ id: string; status: string }>(`/listings/${id}/${command}`, {
        method: 'POST',
      }),

    remove: (id: string) => this.request<void>(`/listings/${id}`, { method: 'DELETE' }),
  };

  // ---------------- Catalogue and geography ----------------

  categories = {
    tree: (listingType?: string) =>
      this.request<Category[]>('/categories', { query: { listingType } }),
    bySlug: (slug: string) => this.request<Category>(`/categories/${encodeURIComponent(slug)}`),
  };

  locations = {
    cities: (query: Record<string, unknown> = {}) =>
      this.request<City[]>('/locations/cities', { query }),
    city: (slug: string) => this.request<City>(`/locations/cities/${encodeURIComponent(slug)}`),
    resolve: (latitude: number, longitude: number) =>
      this.request<{ city: City | null }>('/locations/resolve', {
        method: 'POST',
        body: JSON.stringify({ latitude, longitude }),
      }),
    saved: () => this.request<unknown[]>('/locations/saved'),
  };

  // ---------------- Engagement ----------------

  conversations = {
    list: () => this.request<Paginated<unknown>>('/conversations'),
    get: (id: string) => this.request<unknown>(`/conversations/${id}`),
    start: (listingId: string, message: string) =>
      this.request<{ id: string }>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ listingId, message }),
      }),
    send: (id: string, body: string) =>
      this.request<unknown>(`/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    unreadCount: () => this.request<{ count: number }>('/conversations/unread-count'),
  };

  notifications = {
    list: (query: Record<string, unknown> = {}) =>
      this.request<Paginated<unknown>>('/notifications', { query }),
    unreadCount: () => this.request<{ count: number }>('/notifications/unread-count'),
    markRead: (id: string) => this.request<void>(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () =>
      this.request<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
  };

  reports = {
    create: (body: Record<string, unknown>) =>
      this.request<{ id: string; message: string }>('/reports', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  };

  businesses = {
    mine: () => this.request<unknown[]>('/businesses/mine'),
    bySlug: (slug: string) => this.request<unknown>(`/businesses/${encodeURIComponent(slug)}`),
    create: (body: Record<string, unknown>) =>
      this.request<{ id: string; slug: string }>('/businesses', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  };

  // ---------------- Moderation and administration ----------------

  moderation = {
    queue: (query: Record<string, unknown> = {}) =>
      this.request<Paginated<ModerationQueueItem>>('/moderation/queue', { query }),
    approve: (id: string, note?: string) =>
      this.request<{ id: string; status: string }>(`/moderation/listings/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    reject: (id: string, reason: string) =>
      this.request<{ id: string; status: string }>(`/moderation/listings/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  };

  admin = {
    metrics: () => this.request<Record<string, number>>('/admin/metrics'),
    queues: () => this.request<unknown[]>('/admin/queues'),
    searchIndexStatus: () => this.request<SearchIndexStatus>('/search/index/status'),
    rebuildSearchIndex: () =>
      this.request<{ queued: boolean }>('/search/index/rebuild', { method: 'POST' }),
  };

  health = {
    live: () => this.request<{ status: string; uptimeSeconds: number }>('/health/live'),
    ready: () => this.request<{ status: string; checks: Record<string, boolean> }>('/health/ready'),
  };
}

export function createClient(options: ClientOptions): LoczClient {
  return new LoczClient(options);
}
