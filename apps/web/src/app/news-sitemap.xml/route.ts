import { apiSafe, SITE_URL } from '@/lib/api';

// Google News sitemap: only articles from the last 48h, with the <news:news> block Google News
// requires. Submit https://locz.in/news-sitemap.xml in Search Console. Refreshed every 10 min.
export const dynamic = 'force-dynamic';
export const revalidate = 600;

interface SitemapStory {
  slug: string;
  title: string;
  publishedAt: string;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(): Promise<Response> {
  const stories =
    (await apiSafe<SitemapStory[]>('/news/stories/sitemap', { revalidate: 600 })) ?? [];

  const urls = stories
    .map(
      (s) => `  <url>
    <loc>${SITE_URL}/news/${xmlEscape(s.slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>LocZ</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${s.publishedAt}</news:publication_date>
      <news:title>${xmlEscape(s.title)}</news:title>
    </news:news>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    },
  });
}
