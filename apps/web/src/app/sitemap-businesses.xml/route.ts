import { SITE_URL, apiSafe } from '@/lib/api';

// Business profile pages are LocZ's largest indexable surface (millions of curated local places),
// far beyond a single 50k-URL sitemap. So this route serves both a sitemap *index* (no `page`) and
// each 50k-URL shard (`?page=N`), all cached hard — the count and slug queries run at most daily.
export const revalidate = 86400;

const SHARD_SIZE = 50000;

interface SlugPage {
  slugs: Array<{ slug: string; updatedAt: string }>;
  total: number;
}

function xmlResponse(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const pageParam = new URL(request.url).searchParams.get('page');

  // Index: list one <sitemap> per shard.
  if (pageParam === null) {
    const first = await apiSafe<SlugPage>('/businesses/sitemap-slugs?page=0', {
      revalidate,
    });
    const total = first?.total ?? 0;
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
  const data = await apiSafe<SlugPage>(`/businesses/sitemap-slugs?page=${page}`, { revalidate });
  const urls = (data?.slugs ?? [])
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
