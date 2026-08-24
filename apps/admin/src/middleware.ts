import { NextRequest, NextResponse } from 'next/server';

/**
 * Repairs headers that arrive duplicated from the reverse proxy.
 *
 * OpenLiteSpeed forwards `Origin` twice on proxied requests, and Node joins repeated headers
 * with `", "`. Next validates a Server Action by parsing that value as a URL, so it receives
 * `https://admin.locz.in, https://admin.locz.in` and throws `TypeError: Invalid URL` before any of its
 * own checks run — which is why `serverActions.allowedOrigins` cannot help.
 *
 * Every value in a repeated header is the same here, so taking the first is not a guess — it
 * is undoing a duplication. Anything that genuinely carries a comma-separated list, such as
 * `X-Forwarded-For`, is deliberately left alone.
 */
const DEDUPLICATE = ['origin', 'x-forwarded-host', 'x-forwarded-proto'];

const ACCESS_COOKIE = 'locz_admin_access';
const REFRESH_COOKIE = 'locz_admin_refresh';
const USER_COOKIE = 'locz_admin_user';
const API_BASE = process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL ?? 'http://localhost:4000/api/v1';

function repairHeaders(request: NextRequest): { headers: Headers; repaired: boolean } {
  const headers = new Headers(request.headers);
  let repaired = false;
  for (const name of DEDUPLICATE) {
    const value = headers.get(name);
    if (!value?.includes(',')) continue;
    const parts = value.split(',').map((part) => part.trim());
    // Only collapse when the repeats agree. Differing values would mean a genuine chain of
    // proxies, and silently keeping the first could hide a misrouted request.
    if (new Set(parts).size !== 1) continue;
    headers.set(name, parts[0]!);
    repaired = true;
  }
  return { headers, repaired };
}

/** Replace (or add) one cookie in a Cookie header string, so the downstream handler reads it. */
function replaceCookie(cookieHeader: string, name: string, value: string): string {
  const others = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith(`${name}=`));
  others.push(`${name}=${value}`);
  return others.join('; ');
}

/**
 * Keeps the admin session alive.
 *
 * The access-token cookie lives exactly as long as the token itself (15 minutes). When it has
 * expired but the 30-day refresh token is still present, mint a fresh pair HERE — once, in one
 * place, so a moderator's session does not silently die at 15 minutes and every action past
 * that stops with "Authentication is required for this action". Refresh tokens rotate on use,
 * so doing this only in middleware (never also in the API client) avoids a double-use that
 * would revoke the whole session family. The new access token is also injected into the current
 * request, so an action posted at the very moment the token expired reads the fresh one.
 */
export async function middleware(request: NextRequest) {
  const { headers, repaired } = repairHeaders(request);

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!access && refresh) {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
        cache: 'no-store',
      });

      if (res.ok) {
        const body = (await res.json()) as { data?: { tokens?: TokenPair }; tokens?: TokenPair };
        const tokens = body.data?.tokens ?? body.tokens;
        if (tokens?.accessToken) {
          const secure = request.nextUrl.protocol === 'https:';
          headers.set(
            'cookie',
            replaceCookie(request.headers.get('cookie') ?? '', ACCESS_COOKIE, tokens.accessToken),
          );
          const response = NextResponse.next({ request: { headers } });
          response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
            httpOnly: true,
            secure,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 15,
          });
          response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
            httpOnly: true,
            secure,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
          });
          return response;
        }
      } else {
        // The refresh token is spent or revoked — the session is genuinely over. Drop the stale
        // cookies so the console shows the sign-in page rather than looping on a dead token.
        const response = NextResponse.next({ request: { headers } });
        response.cookies.delete(REFRESH_COOKIE);
        response.cookies.delete(USER_COOKIE);
        return response;
      }
    } catch {
      // A transient network error reaching the API — let the request through; the page's own
      // auth check will handle a still-missing session.
    }
  }

  if (!repaired) return NextResponse.next();
  return NextResponse.next({ request: { headers } });
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export const config = {
  // Everything except static assets — a Server Action can be posted to any route.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
