import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Category, City } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import { getMessageGroup, getTranslator } from '@/i18n';
import { ApiError, SITE_URL, api, apiSafe } from '@/lib/api';
import { localizedName } from '@/lib/localized-name';
import { getLocale, localizedAlternates } from '@/lib/session';

interface HubBusiness {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  pincode: string | null;
  addressLine: string | null;
  verificationStatus: string;
  listingCount: number;
}

async function loadCity(slug: string): Promise<City | null> {
  try {
    return await api<City>(`/locations/cities/${encodeURIComponent(slug)}`, {
      revalidate: 86400,
      tags: ['cities'],
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

async function loadCategory(slug: string): Promise<Category | null> {
  try {
    return await api<Category>(`/categories/${encodeURIComponent(slug)}`, {
      revalidate: 86400,
      tags: ['categories'],
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

// Business categories (the import taxonomy, not the marketplace tree), for the sibling cross-links.
async function loadCategories(): Promise<Array<{ slug: string; name: string }>> {
  return (
    (await apiSafe<Array<{ slug: string; name: string }>>('/businesses/categories', {
      revalidate: 86400,
    })) ?? []
  );
}

// Launched cities, for the "this category in other cities" cross-links.
async function loadCities(): Promise<City[]> {
  return (
    (await apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=12', {
      revalidate: 86400,
    })) ?? []
  );
}

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; category: string }>;
}): Promise<Metadata> {
  const { city: citySlug, category: categorySlug } = await params;
  const [city, category, locale] = await Promise.all([
    loadCity(citySlug).catch(() => null),
    loadCategory(categorySlug).catch(() => null),
    getLocale(),
  ]);
  if (!city || !category) {
    return { title: 'Not found', robots: { index: false, follow: false } };
  }
  const h = getMessageGroup(locale, 'hub');
  // The names the page is *about*. Served at /te and /hi these were English, so the title and
  // meta description of every city-by-category hub were English behind <html lang="te">.
  const categoryName = localizedName(category, locale);
  const cityName = localizedName(city, locale);
  const title = h.metaTitle.replace('{category}', categoryName).replace('{city}', cityName);
  const description = h.metaDescription
    // Lower-casing is an English habit; Telugu and Devanagari have no case, and forcing it on
    // a name that did not come from English is how a proper noun ends up looking wrong.
    .replace('{category}', locale === 'en' ? categoryName.toLowerCase() : categoryName)
    .replace('{city}', cityName);
  return {
    title,
    description,
    alternates: await localizedAlternates(`/in/${city.slug}/${category.slug}`),
    openGraph: { title, description, type: 'website', locale: `${locale}_IN` },
  };
}

/**
 * City × category hub — "Restaurants & food in Hyderabad". Captures the "{category} in {area}"
 * demand the individual business stubs never could, and cross-links down into the businesses and
 * sideways to sibling categories/cities, weaving the directory into a crawlable mesh.
 */
export default async function CityCategoryPage({
  params,
}: {
  params: Promise<{ city: string; category: string }>;
}) {
  const { city: citySlug, category: categorySlug } = await params;
  const [locale, city, category] = await Promise.all([
    getLocale(),
    loadCity(citySlug),
    loadCategory(categorySlug),
  ]);
  if (!city || !category) notFound();

  const t = getTranslator(locale);
  const h = getMessageGroup(locale, 'hub');

  const [result, categories, cities] = await Promise.all([
    apiSafe<{ items: HubBusiness[]; meta: { total: number } }>(
      `/businesses?cityId=${city.id}&categoryId=${category.id}&limit=30&sort=recommended`,
      { revalidate: 900 },
    ),
    loadCategories(),
    loadCities(),
  ]);
  const businesses = result?.items ?? [];
  const total = result?.meta?.total ?? 0;
  const categoryName = localizedName(category, locale);
  const cityName = localizedName(city, locale);
  const placeLabel = `${categoryName} ${h.inWord} ${cityName}`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'LocZ', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: cityName, item: `${SITE_URL}/in/${city.slug}` },
      { '@type': 'ListItem', position: 3, name: categoryName },
    ],
  };
  const itemListLd = businesses.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: placeLabel,
        itemListElement: businesses.map((b, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE_URL}/b/${b.slug}`,
          name: b.name,
        })),
      }
    : null;

  const siblingCategories = categories.filter((c) => c.slug !== category.slug).slice(0, 10);
  const otherCities = cities.filter((c) => c.slug !== city.slug).slice(0, 8);

  return (
    <div className="hub-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }}
      />
      {itemListLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd).replace(/</g, '\\u003c') }}
        />
      ) : null}

      <section className="hub-hero">
        <div className="container">
          <nav className="breadcrumbs" aria-label={t('common.breadcrumb')}>
            <Link href="/">{t('nav.home')}</Link>
            <span>›</span>
            <Link href={`/in/${city.slug}`}>{cityName}</Link>
            <span>›</span>
            <span>{categoryName}</span>
          </nav>
          <h1>{placeLabel}</h1>
          <p>
            {total > 0
              ? h.subtitle
                  .replace('{count}', total.toLocaleString(`${locale}-IN`))
                  .replace(
                    '{category}',
                    locale === 'en' ? categoryName.toLowerCase() : categoryName,
                  )
                  .replace('{city}', cityName)
              : h.subtitleEmpty
                  .replace(
                    '{category}',
                    locale === 'en' ? categoryName.toLowerCase() : categoryName,
                  )
                  .replace('{city}', cityName)}
          </p>
        </div>
      </section>

      <div className="container hub-body">
        <main>
          {businesses.length > 0 ? (
            <ul className="hub-list">
              {businesses.map((b) => (
                <li key={b.id}>
                  <Link href={`/b/${b.slug}`}>
                    <span className="hub-list__logo" aria-hidden="true">
                      {b.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="hub-list__body">
                      <strong>{b.name}</strong>
                      <small>
                        {b.verificationStatus === 'VERIFIED' ? (
                          <>
                            <Icon name="shield" /> {h.verified} ·{' '}
                          </>
                        ) : null}
                        {[b.addressLine, b.cityName, b.pincode].filter(Boolean).join(', ')}
                      </small>
                      {b.listingCount > 0 ? (
                        <em>{h.listings.replace('{count}', String(b.listingCount))}</em>
                      ) : null}
                    </span>
                    <Icon name="arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hub-empty">
              <h2>
                {h.emptyTitle.replace('{category}', categoryName).replace('{city}', cityName)}
              </h2>
              <p>{h.emptyBody}</p>
              <Link href={`/in/${city.slug}`} className="btn btn--primary">
                {h.browseCity.replace('{city}', cityName)} <Icon name="arrow" />
              </Link>
            </div>
          )}

          {total > businesses.length ? (
            <Link
              href={`/search?cityId=${city.id}&categoryId=${category.id}`}
              className="hub-seeall btn btn--ghost"
            >
              {h.seeAll.replace('{count}', total.toLocaleString(`${locale}-IN`))}{' '}
              <Icon name="arrow" />
            </Link>
          ) : null}
        </main>

        <aside className="hub-cross">
          {siblingCategories.length > 0 ? (
            <section>
              <h2>{h.otherCategories.replace('{city}', cityName)}</h2>
              <ul>
                {siblingCategories.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/in/${city.slug}/${c.slug}`}>{c.name}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {otherCities.length > 0 ? (
            <section>
              <h2>{h.inOtherCities.replace('{category}', categoryName)}</h2>
              <ul>
                {otherCities.map((c) => (
                  <li key={c.id}>
                    <Link href={`/in/${c.slug}/${category.slug}`}>
                      {categoryName} {h.inWord} {localizedName(c, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
