import { NextRequest, NextResponse } from 'next/server';

/**
 * Repairs headers that arrive duplicated from the reverse proxy.
 *
 * OpenLiteSpeed forwards `Origin` twice on proxied requests, and Node joins repeated headers
 * with `", "`. Next validates a Server Action by parsing that value as a URL, so it receives
 * `https://admin.locz.in, https://admin.locz.in` and throws `TypeError: Invalid URL` before any of its
 * own checks run — which is why `serverActions.allowedOrigins` cannot help.
 *
 * The web app was repaired for this; the console was not, so every Server Action here failed
 * while ordinary page loads looked healthy. The visible symptom was Google sign-in doing
 * nothing at all: the credential came back, the action answered 500, and the page sat still.
 * Password sign-in was affected identically and simply had not been tried.
 *
 * Every value in a repeated header is the same here, so taking the first is not a guess — it
 * is undoing a duplication. Anything that genuinely carries a comma-separated list, such as
 * `X-Forwarded-For`, is deliberately left alone.
 */
const DEDUPLICATE = ['origin', 'x-forwarded-host', 'x-forwarded-proto'];

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  let repaired = false;

  for (const name of DEDUPLICATE) {
    const value = headers.get(name);
    if (!value?.includes(',')) continue;

    const parts = value.split(',').map((part) => part.trim());
    // Only collapse when the repeats agree. Differing values would mean a genuine chain of
    // proxies, and silently keeping the first could hide a misrouted request.
    if (new Set(parts).size !== 1) continue;

    headers.set(name, parts[0]);
    repaired = true;
  }

  if (!repaired) return NextResponse.next();
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except static assets — a Server Action can be posted to any route.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
