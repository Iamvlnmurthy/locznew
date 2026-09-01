import { unstable_cache } from 'next/cache';
import { SITE_URL, apiSafe } from '@/lib/api';

// Service-area SEO pages (`/services/{category}/{locality}`) — one per category+locality pair that
// has >=5 contactable providers (the quality gate lives in the API). Served as a sitemap *index*
// (no `page`) plus 10k-URL shards (`?page=N`), same shape as the IFSC sitemap.
export const revalidate = 86400;
const SHARD_SIZE = 10000;

const loadTotal = unstable_cache(
  async (): Promise<number> =>
    (await apiSafe<{ total: number }>(`/businesses/service-areas/sitemap-count`, { revalidate }))
      ?.total ?? 0,
  ['service-sitemap-total'],
  { revalidate: 86400 },
);

const loadShard = unstable_cache(
  async (page: number): Promise<Array<{ categorySlug: string; localitySlug: string }> | null> =>
    (
      await apiSafe<{ areas: Array<{ categorySlug: string; localitySlug: string }> }>(
        `/businesses/service-areas/sitemap?page=${page}&pageSize=${SHARD_SIZE}`,
        { revalidate },
      )
    )?.areas ?? null,
  ['service-sitemap-shard'],
  { revalidate: 86400 },
);

function xmlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const pageParam = new URL(request.url).searchParams.get('page');

  if (pageParam === null) {
    const total = await loadTotal();
    const shards = Math.max(1, Math.ceil(total / SHARD_SIZE));
    const items = Array.from(
      { length: shards },
      (_, i) => `  <sitemap><loc>${SITE_URL}/sitemap-services.xml?page=${i}</loc></sitemap>`,
    ).join('\n');
    return xmlResponse(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`,
    );
  }

  const page = Math.max(0, Number(pageParam) || 0);
  const areas = await loadShard(page);
  if (areas === null) {
    return new Response('Sitemap shard temporarily unavailable', {
      status: 503,
      headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' },
    });
  }
  const urls = areas
    .map(
      (a) =>
        `  <url><loc>${SITE_URL}/services/${a.categorySlug}/${a.localitySlug}</loc><changefreq>weekly</changefreq></url>`,
    )
    .join('\n');
  return xmlResponse(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
  );
}
