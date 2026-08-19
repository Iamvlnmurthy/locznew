import { unstable_cache } from 'next/cache';
import { SITE_URL, apiSafe } from '@/lib/api';

// Business profile pages are LocZ's largest indexable surface (millions of curated local places),
// far beyond a single 50k-URL sitemap. So this route serves both a sitemap *index* (no `page`) and
// each 50k-URL shard (`?page=N`). The underlying count + slug queries are heavy (a filtered scan of
// ~3.4M rows), so each page is memoised for a day — a crawler pays the cost at most once per shard
// per day, and repeat fetches are instant.
export const revalidate = 86400;

const SHARD_SIZE = 50000;

interface SlugPage {
  slugs: Array<{ slug: string; updatedAt: string }>;
}

const loadTotal = unstable_cache(
  async (): Promise<number> =>
    (await apiSafe<{ total: number }>('/businesses/sitemap-count', { revalidate }))?.total ?? 0,
  ['business-sitemap-count'],
  { revalidate: 86400 },
);

const loadSlugPage = unstable_cache(
  async (page: number): Promise<SlugPage> =>
    (await apiSafe<SlugPage>(`/businesses/sitemap-slugs?page=${page}`, { revalidate })) ?? {
      slugs: [],
    },
  ['business-sitemap-page'],
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

  // Index: one <sitemap> per shard.
  if (pageParam === null) {
    const total = await loadTotal();
    const shards = Math.max(1, Math.ceil(total / SHARD_SIZE));
    const items = Array.from(
      { length: shards },
      (_, i) => `  <sitemap><loc>${SITE_URL}/sitemap-businesses.xml?page=${i}</loc></sitemap>`,
    ).join('\n');
    return xmlResponse(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`,
    );
  }

  // Shard: the business URLs for this page.
  const page = Math.max(0, Number(pageParam) || 0);
  const { slugs } = await loadSlugPage(page);
  const urls = slugs
    .map(
      (b) =>
        `  <url><loc>${SITE_URL}/b/${b.slug}</loc><lastmod>${new Date(
          b.updatedAt,
        ).toISOString()}</lastmod><changefreq>weekly</changefreq></url>`,
    )
    .join('\n');
  return xmlResponse(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
  );
}
