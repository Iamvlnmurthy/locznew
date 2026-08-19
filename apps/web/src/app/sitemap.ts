import type { MetadataRoute } from 'next';
import type { Category, City } from '@locz/shared-types';
import { SITE_URL, apiSafe } from '@/lib/api';

/**
 * Sitemap covering the indexable surfaces: home, launched cities and categories — each in all
 * three languages (English at the root, Telugu under /te, Hindi under /hi).
 *
 * Individual listings are deliberately excluded — they expire within 30 days, and a
 * sitemap full of dead URLs damages crawl trust more than the extra coverage helps.
 * Listings are discovered through their city and category pages instead.
 */
export const revalidate = 3600;

const LOCALES = ['en', 'te', 'hi'] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, categories] = await Promise.all([
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
  ]);

  const now = new Date();

  // The hreflang cluster shared by every language version of one path. Google's recommended
  // multilingual form: each locale gets its own <url> entry, and all of them carry the identical
  // alternates block pointing at the whole cluster.
  const languagesFor = (path: string): Record<string, string> => {
    const base = path === '/' ? '' : path;
    return {
      en: `${SITE_URL}${path}`,
      te: `${SITE_URL}/te${base}`,
      hi: `${SITE_URL}/hi${base}`,
      'x-default': `${SITE_URL}${path}`,
    };
  };

  // Expand one logical page into three crawlable URLs (en / te / hi), each self-declaring the
  // full language cluster.
  const localized = (
    path: string,
    meta: Pick<MetadataRoute.Sitemap[number], 'changeFrequency' | 'priority'>,
  ): MetadataRoute.Sitemap => {
    const languages = languagesFor(path);
    return LOCALES.map((locale) => ({
      url: languages[locale],
      lastModified: now,
      ...meta,
      alternates: { languages },
    }));
  };

  const entries: MetadataRoute.Sitemap = [
    ...localized('/', { changeFrequency: 'hourly', priority: 1 }),
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
    entries.push(...localized(path, { changeFrequency: 'monthly', priority: 0.3 }));
  }

  for (const city of cities ?? []) {
    entries.push(...localized(`/in/${city.slug}`, { changeFrequency: 'hourly', priority: 0.9 }));
  }

  const flatten = (list: Category[]): Category[] =>
    list.flatMap((category) => [category, ...flatten(category.children ?? [])]);

  for (const category of flatten(categories ?? [])) {
    entries.push(
      ...localized(`/c/${category.slug}`, {
        changeFrequency: 'daily',
        priority: category.parentId ? 0.6 : 0.8,
      }),
    );
  }

  return entries;
}
