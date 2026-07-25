import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/api';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Personal and transactional paths have no business in an index, and crawling
        // them wastes crawl budget that belongs to listing and city pages.
        disallow: ['/dashboard', '/chats', '/signin', '/post', '/search', '/api/', '/location'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
