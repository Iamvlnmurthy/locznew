import { unstable_cache } from 'next/cache';
import { SITE_URL, apiSafe } from '@/lib/api';

// Dedicated per-branch IFSC pages (`/ifsc/{code}`) — one per RBI branch (~183k). Served as a sitemap
// *index* (no `page`) plus 10k-URL shards (`?page=N`). bank_branches is a small, static reference table,
// so OFFSET pagination is cheap here (unlike the multi-million business sitemap which needs keyset).
export const revalidate = 86400;
const SHARD_SIZE = 10000;

const loadTotal = unstable_cache(
  async (): Promise<number> =>
    (await apiSafe<{ total: number }>(`/banks/ifsc-sitemap/count`, { revalidate }))?.total ?? 0,
  ['ifsc-sitemap-total'],
  { revalidate: 86400 },
);

const loadShard = unstable_cache(
  async (page: number): Promise<string[] | null> =>
    (
      await apiSafe<{ codes: string[] }>(
        `/banks/ifsc-sitemap?page=${page}&pageSize=${SHARD_SIZE}`,
        {
          revalidate,
        },
      )
    )?.codes ?? null,
  ['ifsc-sitemap-shard'],
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
      (_, i) => `  <sitemap><loc>${SITE_URL}/sitemap-ifsc.xml?page=${i}</loc></sitemap>`,
    ).join('\n');
    return xmlResponse(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`,
    );
  }

  const page = Math.max(0, Number(pageParam) || 0);
  const codes = await loadShard(page);
  if (codes === null) {
    return new Response('Sitemap shard temporarily unavailable', {
      status: 503,
      headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' },
    });
  }
  const urls = codes
    .map(
      (code) => `  <url><loc>${SITE_URL}/ifsc/${code}</loc><changefreq>monthly</changefreq></url>`,
    )
    .join('\n');
  return xmlResponse(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
  );
}
