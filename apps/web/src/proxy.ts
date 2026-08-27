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

export function proxy(request: NextRequest) {
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

  // Locale-addressable URLs for search: /te/... and /hi/... render the same routes in that
  // language (English stays unprefixed). We rewrite (not redirect) so the URL a crawler sees
  // stays /te/..., set x-locale for getLocale, and expose the un-prefixed path as x-pathname so
  // the page renders its normal route and its hreflang/canonical are built from the real path.
  const pathname = request.nextUrl.pathname;
  const firstSegment = pathname.split('/')[1];

  if (firstSegment === 'te' || firstSegment === 'hi') {
    const strippedPath = pathname.slice(firstSegment.length + 1) || '/';
    headers.set('x-locale', firstSegment);
    headers.set('x-pathname', strippedPath);
    const url = request.nextUrl.clone();
    url.pathname = strippedPath;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  // Expose the path to server components (hreflang, and the header hiding its own search on the
  // home page). Server components cannot read the route otherwise.
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except static assets — a Server Action can be posted to any route.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand|seed).*)'],
};
