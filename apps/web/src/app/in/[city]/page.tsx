import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Category, City, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { getTranslator } from '@/i18n';
import { ApiError, api, apiSafe } from '@/lib/api';
import { getLocale } from '@/lib/session';

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  const city = await loadCity(slug).catch(() => null);
  if (!city) return { title: 'City not found', robots: { index: false, follow: false } };

  const title = `${city.name} — Find it here.. Deal it near..`;
  const description = `Find it here.. Deal it near.. Buy, sell and find local services, jobs and offers in ${city.name}, ${city.stateName}. Posting on LocZ is always free.`;

  return {
    title,
    description,
    alternates: { canonical: `/in/${city.slug}` },
    openGraph: { title, description, type: 'website', locale: 'en_IN' },
  };
}

/**
 * City landing page — the primary indexable surface. "used bikes in warangal" is the
 * query LocZ needs to win, and a cached page per launched city is how.
 */
export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: slug } = await params;
  const [locale, city] = await Promise.all([getLocale(), loadCity(slug)]);

  if (!city) notFound();

  const t = getTranslator(locale);

  const [result, categories] = await Promise.all([
    apiSafe<{ items: ListingSummary[]; total: number }>(
      `/search?cityId=${city.id}&limit=24&sort=newest`,
      { revalidate: 300 },
    ),
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
  ]);

  // Place structured data helps Google associate the page with the city itself.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Classifieds in ${city.name}`,
    about: {
      '@type': 'City',
      name: city.name,
      address: {
        '@type': 'PostalAddress',
        addressLocality: city.name,
        addressRegion: city.stateName,
        addressCountry: 'IN',
      },
      geo: { '@type': 'GeoCoordinates', latitude: city.latitude, longitude: city.longitude },
    },
  };

  return (
    <div className="container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">{t('nav.home')}</Link>
        <span>›</span>
        <span>{city.name}</span>
      </nav>

      <h1 className="page-title">
        {t('brand.name')} {city.name}
      </h1>
      <p className="page-subtitle">
        {city.stateName}
        {result ? ` · ${result.total.toLocaleString('en-IN')} ads` : ''} · {t('footer.postFree')}
      </p>

      {categories && categories.length > 0 ? (
        <nav className="category-strip" aria-label={t('feed.browseCategories')}>
          {categories.slice(0, 12).map((category) => (
            <Link key={category.id} href={`/c/${category.slug}`} className="category-chip">
              {category.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!result || result.items.length === 0 ? (
        <div className="empty-state">
          <p>{t('feed.empty')}</p>
          <Link href="/post" className="btn btn--primary" style={{ marginTop: 16 }}>
            + {t('nav.post')}
          </Link>
        </div>
      ) : (
        <div className="card-grid" style={{ marginTop: 24 }}>
          {result.items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
