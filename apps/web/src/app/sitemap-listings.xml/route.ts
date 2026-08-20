import { unstable_cache } from 'next/cache';
import { SITE_URL, apiSafe } from '@/lib/api';

// User-posted ads (/ad/[slug]) are deliberately kept out of the main sitemap.xml: they expire
// within ~30 days, so a sitemap full of them would keep announcing URLs that soon 404 and erode
// crawl trust. This separate, short-lived sitemap lists ONLY currently-published ads — matching
// the ad page's own `robots: index` rule — so a new ad is discovered quickly and an expired one
// simply drops out on the next revalidation (the page is `noindex` by then, never a 404 surprise).
//
// Ads change often, so this revalidates hourly (vs a day for the durable business sitemap). A
// single file for now; if the active set ever nears 50k it must be sharded like sitemap-businesses.
// Render per request (the underlying data is still cached for an hour by unstable_cache below).
// Without this the route prerenders once at build time, when the API may be unreachable, and
// would then serve an empty sitemap until the ISR window elapsed.
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface Slug {
  slug: string;
  updatedAt: string;
}

const loadSlugs = unstable_cache(
  async (): Promise<Slug[]> =>
    (await apiSafe<{ slugs: Slug[] }>('/listings/sitemap-slugs?limit=50000', { revalidate }))
      ?.slugs ?? [],
  ['listing-sitemap-slugs-v2'],
  { revalidate: 3600 },
);

export async function GET(): Promise<Response> {
  const slugs = await loadSlugs();
  const urls = slugs
    .map(
      (l) =>
        `  <url><loc>${SITE_URL}/ad/${l.slug}</loc><lastmod>${new Date(
          l.updatedAt,
        ).toISOString()}</lastmod><changefreq>daily</changefreq></url>`,
    )
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  );
}
