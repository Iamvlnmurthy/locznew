import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Category, City } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import { getMessageGroup, getTranslator } from '@/i18n';
import { ApiError, SITE_URL, api, apiSafe } from '@/lib/api';
import { localizedName } from '@/lib/localized-name';
import { getLocale, localizedAlternates } from '@/lib/session';

/**
 * "Dental clinics in Nanakramguda" — a category inside one neighbourhood.
 *
 * This is the shape of search a directory can actually win. Search Console shows
 * every query currently earning impressions is a *brand* name — "sr international
 * spa" took 180 impressions and no clicks — because that business's own Google
 * profile answers it above us, with a phone number, before anyone scrolls to
 * position nine. We cannot beat a business at being itself.
 *
 * Nobody's own profile ranks for this page's question, though, because the
 * question asks for a *set*: which dental clinics are in this neighbourhood. Only
 * something holding many businesses can answer that, and 2.3 million of ours
 * carry a locality.
 *
 * Three segments, so it cannot collide with the two-segment /in/[city]/[category]
 * pages that are already indexed and carrying the site's impressions.
 */

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

interface Locality {
  id: string;
  name: string;
  slug: string;
  postalCode: string | null;
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

/** Locality slugs are unique per city, not globally, so the city has to be known first. */
async function loadLocality(cityId: string, slug: string): Promise<Locality | null> {
  return (
    (await apiSafe<Locality>(
      `/locations/cities/${encodeURIComponent(cityId)}/localities/${encodeURIComponent(slug)}`,
      { revalidate: 86400, tags: ['localities'] },
    )) ?? null
  );
}

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; locality: string; category: string }>;
}): Promise<Metadata> {
  const { city: citySlug, locality: localitySlug, category: categorySlug } = await params;
  const [locale, city, category] = await Promise.all([
    getLocale(),
    loadCity(citySlug),
    loadCategory(categorySlug),
  ]);
  if (!city || !category) return { title: 'Not found' };
  const locality = await loadLocality(city.id, localitySlug);
  if (!locality) return { title: 'Not found' };

  const categoryName = localizedName(category, locale);
  const cityName = localizedName(city, locale);
  const h = getMessageGroup(locale, 'hub');

  // The neighbourhood leads, because it is the specific thing the searcher typed
  // and the thing that makes this page different from the city-wide one.
  const title = `${categoryName} ${h.inWord} ${locality.name}, ${cityName} | LocZ`;

  return {
    title,
    description: `${categoryName} in ${locality.name}, ${cityName}. Addresses, phone numbers and directions for local businesses on LocZ.`,
    alternates: await localizedAlternates(`/in/${city.slug}/${locality.slug}/${category.slug}`),
  };
}

export default async function LocalityCategoryPage({
  params,
}: {
  params: Promise<{ city: string; locality: string; category: string }>;
}) {
  const { city: citySlug, locality: localitySlug, category: categorySlug } = await params;
  const [locale, city, category] = await Promise.all([
    getLocale(),
    loadCity(citySlug),
    loadCategory(categorySlug),
  ]);
  if (!city || !category) notFound();

  const locality = await loadLocality(city.id, localitySlug);
  if (!locality) notFound();

  const t = getTranslator(locale);
  const h = getMessageGroup(locale, 'hub');

  const result = await apiSafe<{ items: HubBusiness[]; meta: { total: number } }>(
    `/businesses?cityId=${city.id}&categoryId=${category.id}` +
      `&localitySlug=${encodeURIComponent(locality.slug)}&limit=30&sort=recommended`,
    { revalidate: 900 },
  );
  const businesses = result?.items ?? [];
  const total = result?.meta?.total ?? 0;

  // A neighbourhood page with nothing in it is worse than no page: it is a URL
  // asking to be indexed while answering nothing. Send the reader up a level.
  if (businesses.length === 0) notFound();

  const categoryName = localizedName(category, locale);
  const cityName = localizedName(city, locale);
  const placeLabel = `${categoryName} ${h.inWord} ${locality.name}`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'LocZ', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: cityName, item: `${SITE_URL}/in/${city.slug}` },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${categoryName} ${h.inWord} ${cityName}`,
        item: `${SITE_URL}/in/${city.slug}/${category.slug}`,
      },
      { '@type': 'ListItem', position: 4, name: locality.name },
    ],
  };

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${placeLabel}, ${cityName}`,
    itemListElement: businesses.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/b/${b.slug}`,
      name: b.name,
    })),
  };

  return (
    <div className="hub-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd).replace(/</g, '\\u003c') }}
      />

      <section className="hub-hero">
        <div className="container">
          <nav className="breadcrumbs" aria-label={t('common.breadcrumb')}>
            <Link href="/">{t('nav.home')}</Link>
            <span>›</span>
            <Link href={`/in/${city.slug}`}>{cityName}</Link>
            <span>›</span>
            <Link href={`/in/${city.slug}/${category.slug}`}>{categoryName}</Link>
            <span>›</span>
            <span>{locality.name}</span>
          </nav>
          <h1>
            {placeLabel}, {cityName}
          </h1>
          <p>
            {total.toLocaleString(`${locale}-IN`)}{' '}
            {locale === 'en' ? categoryName.toLowerCase() : categoryName} {h.inWord} {locality.name}
            {locality.postalCode ? ` — ${locality.postalCode}` : ''}.
          </p>
        </div>
      </section>

      <div className="container hub-body">
        <main>
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
                      {[b.addressLine, locality.name, b.pincode].filter(Boolean).join(', ')}
                    </small>
                  </span>
                  <Icon name="arrow" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Up a level rather than sideways: someone who has read every clinic in
              this neighbourhood wants the rest of the city, not another suburb. */}
          <Link href={`/in/${city.slug}/${category.slug}`} className="hub-seeall btn btn--ghost">
            {categoryName} {h.inWord} {cityName} <Icon name="arrow" />
          </Link>
        </main>
      </div>
    </div>
  );
}
