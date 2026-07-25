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

  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'hourly', priority: 1 },
  ];

  for (const city of cities ?? []) {
    entries.push({
      url: `${SITE_URL}/in/${city.slug}`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
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
    });
  }

  return entries;
}
