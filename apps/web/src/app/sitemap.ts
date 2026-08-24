import type { MetadataRoute } from 'next';
import type { Category } from '@locz/shared-types';
import { SITE_URL, apiSafe } from '@/lib/api';
import { CITY_GUIDE_CATALOG } from '@/lib/city-guide-catalog';

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
  const [categories, businessCategories] = await Promise.all([
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
    apiSafe<Array<{ slug: string; name: string; count?: number }>>('/businesses/categories', {
      revalidate: 3600,
    }),
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
    '/cities',
  ]) {
    entries.push(...localized(path, { changeFrequency: 'monthly', priority: 0.3 }));
  }

  for (const city of CITY_GUIDE_CATALOG) {
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

  // City × business-category hub pages ("Restaurants & food in Hyderabad") — the surfaces that
  // capture "{category} in {area}" demand. The endpoint also contains 1,000+ imported granular
  // labels, so only the 45 highest-volume service-taxonomy entries belong here. Expanding every
  // imported label would breach the 50,000 URL limit for a single sitemap and mostly index thin
  // city/category combinations.
  const indexableBusinessCategories = (businessCategories ?? [])
    .filter((category) => category.slug)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 45);
  for (const city of CITY_GUIDE_CATALOG) {
    for (const category of indexableBusinessCategories) {
      entries.push(
        ...localized(`/in/${city.slug}/${category.slug}`, {
          changeFrequency: 'daily',
          priority: 0.7,
        }),
      );
    }
  }

  return entries;
}
