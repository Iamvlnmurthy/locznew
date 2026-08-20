import { unstable_cache } from 'next/cache';
import { SITE_URL, apiSafe } from '@/lib/api';

// Business profile pages are LocZ's largest indexable surface (millions of curated local places),
// far beyond a single 50k-URL sitemap. So this route serves both a sitemap *index* (no `page`) and
// each shard (`?page=N`). Shards paginate by KEYSET (`id >= cursor`), not OFFSET: OFFSET re-scans
// from the start on every shard, so a deep shard skips millions of rows and blows past Google's
// fetch timeout — which is why GSC reported the sitemap "could not be read". The cursor list and
// each shard are memoised for a day, so a crawler pays each cost at most once per day.
export const revalidate = 86400;

// The sitemap spec allows 50k URLs/shard, but a 50k shard is a ~7MB XML doc built from a ~4MB API
// payload — too slow to build within Google's fetch timeout. 10k keeps every shard ~0.8MB and
// quick to serve. More shards, each reliably fetchable.
const SHARD_SIZE = 10000;

interface SlugPage {
  slugs: Array<{ slug: string; updatedAt: string }>;
}

// The first business id of each shard — shards are addressed by these cursors, not row offsets.
const loadCursors = unstable_cache(
  async (): Promise<string[]> =>
    (
      await apiSafe<{ cursors: string[] }>(
        `/businesses/sitemap-shard-cursors?shardSize=${SHARD_SIZE}`,
        { revalidate },
      )
    )?.cursors ?? [],
  ['business-sitemap-cursors'],
  { revalidate: 86400 },
);

const loadSlugPage = unstable_cache(
  async (fromId: string): Promise<SlugPage> =>
    (await apiSafe<SlugPage>(
      `/businesses/sitemap-slugs?from=${encodeURIComponent(fromId)}&pageSize=${SHARD_SIZE}`,
      { revalidate },
    )) ?? {
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

  const cursors = await loadCursors();

  // Index: one <sitemap> per shard.
  if (pageParam === null) {
    const shards = Math.max(1, cursors.length);
    const items = Array.from(
      { length: shards },
      (_, i) => `  <sitemap><loc>${SITE_URL}/sitemap-businesses.xml?page=${i}</loc></sitemap>`,
    ).join('\n');
    return xmlResponse(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`,
    );
  }

  // Shard: the business URLs from this shard's cursor onward.
  const page = Math.max(0, Number(pageParam) || 0);
  const fromId = cursors[page];
  const { slugs } = fromId ? await loadSlugPage(fromId) : { slugs: [] };
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
