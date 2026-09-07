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

// LocZ is a public local directory: being cited as the local source of truth by answer/generative
// engines is a goal, not a threat. The major AI crawlers are explicitly welcomed on the same public
// surface as search engines (they honour `*` already; naming them documents the intent and keeps
// the private-route rules applied to them too).
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'ClaudeBot',
  'Claude-Web',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: DISALLOW },
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
