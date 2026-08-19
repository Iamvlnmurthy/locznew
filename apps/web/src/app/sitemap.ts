import type { MetadataRoute } from 'next';
import type { Category, City } from '@locz/shared-types';
import { SITE_URL, apiSafe } from '@/lib/api';

/**
 * Sitemap covering the indexable surfaces: home, launched cities and categories.
 *
 * Individual listings are deliberately excluded — they expire within 30 days, and a
 * sitemap full of dead URLs damages crawl trust more than the extra coverage helps.
 * Listings are discovered through their city and category pages instead.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, categories] = await Promise.all([
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
  ]);

  const now = new Date();

  // hreflang for the sitemap: every indexable path also exists at /te and /hi. Declaring the
  // alternates here is how Google discovers the language cluster and treats each as its own URL.
  const langs = (path: string): { languages: Record<string, string> } => {
    const base = path === '/' ? '' : path;
    return {
      languages: {
        en: `${SITE_URL}${path}`,
        te: `${SITE_URL}/te${base}`,
        hi: `${SITE_URL}/hi${base}`,
        'x-default': `${SITE_URL}${path}`,
      },
    };
  };

  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1,
      alternates: langs('/'),
    },
  ];

  // Information pages. Low priority but genuinely indexable — "is locz safe" is a real
  // query, and the safety page is the honest answer to it.
  for (const path of [
    '/business',
    '/business/new',
    '/about',
    '/help',
    '/safety',
    '/terms',
    '/privacy',
  ]) {
    entries.push({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
      alternates: langs(path),
    });
  }

  for (const city of cities ?? []) {
    entries.push({
      url: `${SITE_URL}/in/${city.slug}`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
      alternates: langs(`/in/${city.slug}`),
    });
  }

  const flatten = (list: Category[]): Category[] =>
    list.flatMap((category) => [category, ...flatten(category.children ?? [])]);

  for (const category of flatten(categories ?? [])) {
    entries.push({
      url: `${SITE_URL}/c/${category.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: category.parentId ? 0.6 : 0.8,
      alternates: langs(`/c/${category.slug}`),
    });
  }

  return entries;
}
