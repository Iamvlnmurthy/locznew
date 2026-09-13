import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/api';

// Force this route to be evaluated at runtime, not baked in once at build time.
//
// This route has no dynamic API usage (no cookies/headers/live fetch), which made Next treat it
// as fully static and, at least once, reuse a stale compiled output across a later rebuild — the
// live site served "Host: http://localhost:3000" and every "Sitemap:" line pointing at
// localhost, verified straight from origin (bypassing Cloudflare), even though SITE_URL was
// correctly set and sitemap.xml — which fetches live data and is therefore dynamic — was
// correct in the exact same build. Sitemap: lines that 404 make Google stop trusting this file
// as a sitemap source, which is likely why GSC flagged robots.txt with a critical error.
export const dynamic = 'force-dynamic';

// Personal and transactional paths have no business in an index, and crawling them wastes crawl
// budget that belongs to listing and city pages.
const DISALLOW = ['/dashboard', '/chats', '/signin', '/post', '/search', '/api/', '/location'];

// LocZ is a public local directory: being cited as the local source of truth by answer and
// generative engines is a goal, not a threat. But it stopped being free.
//
// On 13 September the box sat at 99% CPU across four cores with the disk at 81%, and the bot
// log explained both:
//
//     GPTBot     236        Googlebot    19
//     Amazonbot  126        bingbot       2
//     ClaudeBot  104
//
// AI crawlers were roughly 95% of bot traffic — twelve times Googlebot. Every request renders a
// page, calls the API, queries Postgres and writes a cache entry, which is also how
// .next/cache/fetch-cache reached 30 GB.
//
// So the welcome is now selective, on one test: can this crawler send a person back?
//
// These can. Their engines cite sources and carry a link, which is the only route LocZ has into
// an AI answer. They stay, with a crawl delay — the cost is latency for them, not capacity for us.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'ClaudeBot',
  'Claude-Web',
  'Google-Extended',
  'Applebot-Extended',
];

// These cannot. Amazonbot was the second-heaviest crawler on the site and fronts no product that
// cites a source; CCBot builds training corpora that no reader ever traverses. Declining them
// costs LocZ no reach at all.
const NO_RETURN_CRAWLERS = ['Amazonbot', 'CCBot'];

// Seconds between requests for the crawlers we keep. Honoured by most, ignored by Googlebot —
// which is fine, because Googlebot is 19 requests and the one that sends visitors.
const AI_CRAWL_DELAY = 5;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: DISALLOW, crawlDelay: AI_CRAWL_DELAY },
      { userAgent: NO_RETURN_CRAWLERS, disallow: '/' },
    ],
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/sitemap-businesses.xml`,
      `${SITE_URL}/sitemap-ifsc.xml`,
      `${SITE_URL}/sitemap-listings.xml`,
      `${SITE_URL}/sitemap-services.xml`,
      `${SITE_URL}/news-sitemap.xml`,
    ],
    host: SITE_URL,
  };
}
