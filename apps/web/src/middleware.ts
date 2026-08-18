import { NextRequest, NextResponse } from 'next/server';

/**
 * Repairs headers that arrive duplicated from the reverse proxy.
 *
 * OpenLiteSpeed forwards `Origin` twice on proxied requests, and Node joins repeated headers
 * with `", "`. Next validates a Server Action by parsing that value as a URL, so it receives
 * `https://locz.in, https://locz.in` and throws `TypeError: Invalid URL` before any of its
 * own checks run — which is why `serverActions.allowedOrigins` cannot help.
 *
 * The user-visible symptom was that choosing an area did nothing: the picker resolved the
 * pincode, called the action, the action answered 500, and the page stayed where it was
 * showing the fallback city. Ordinary page loads were unaffected, so the site looked healthy.
 *
 * Every value in a repeated header is the same here, so taking the first is not a guess — it
 * is undoing a duplication. Anything that genuinely carries a comma-separated list, such as
 * `X-Forwarded-For`, is deliberately left alone.
 */
const DEDUPLICATE = ['origin', 'x-forwarded-host', 'x-forwarded-proto'];

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);

  for (const name of DEDUPLICATE) {
    const value = headers.get(name);
    if (!value?.includes(',')) continue;

    const parts = value.split(',').map((part) => part.trim());
    // Only collapse when the repeats agree. Differing values would mean a genuine chain of
    // proxies, and silently keeping the first could hide a misrouted request.
    if (new Set(parts).size !== 1) continue;

    headers.set(name, parts[0]);
  }

  // Expose the path to server components (the Header hides its own search on the home
  // page, where the hero already owns search). Server components cannot read the route
  // otherwise.
  headers.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except static assets — a Server Action can be posted to any route.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand|seed).*)'],
};
