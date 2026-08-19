import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Category, City, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { Icon } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { ApiError, api, apiSafe } from '@/lib/api';
import { premiumCategoryArtwork } from '@/lib/premium-icon-catalog';
import { getLocale, localizedAlternates } from '@/lib/session';

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
  const [city, locale] = await Promise.all([loadCity(slug).catch(() => null), getLocale()]);
  const t = getTranslator(locale);
  if (!city) {
    return {
      title: t('discovery.cityNotFound'),
      robots: { index: false, follow: false },
    };
  }

  const title = t('discovery.cityMetadataTitle', { city: city.name });
  const description = t('discovery.cityMetadataDescription', {
    city: city.name,
    state: city.stateName,
  });

  return {
    title,
    description,
    alternates: await localizedAlternates(`/in/${city.slug}`),
    openGraph: { title, description, type: 'website', locale: `${locale}_IN` },
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
    name: t('discovery.cityCollectionName', { city: city.name }),
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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <section className="discovery-hero discovery-hero--city">
        <div className="container discovery-hero__inner">
          <div className="discovery-hero__copy">
            <nav className="breadcrumbs breadcrumbs--light" aria-label={t('common.breadcrumb')}>
              <Link href="/">{t('nav.home')}</Link>
              <span>›</span>
              <span>{city.name}</span>
            </nav>
            <span className="eyebrow">
              <i /> {t('discovery.cityEyebrow', { city: city.name })}
            </span>
            <h1>{t('discovery.cityTitle', { city: city.name })}</h1>
            <p>{t('discovery.citySubtitle', { city: city.name, state: city.stateName })}</p>

            <form className="discovery-search" action="/search" method="get" role="search">
              <input type="hidden" name="cityId" value={city.id} />
              <Icon name="search" width="20" height="20" />
              <label htmlFor="city-discovery-search" className="sr-only">
                {t('search.submit')}
              </label>
              <input
                id="city-discovery-search"
                name="q"
                type="search"
                placeholder={t('discovery.searchCity', { city: city.name })}
              />
              <button type="submit">
                {t('search.submit')} <Icon name="arrow" width="16" height="16" />
              </button>
            </form>

            <div className="discovery-hero__proof">
              <span>
                <strong>{result?.total.toLocaleString(`${locale}-IN`) ?? '0'}</strong>
                {t('discovery.localListings')}
              </span>
              <span>
                <strong>₹0</strong>
                {t('discovery.toPost')}
              </span>
              <span>
                <strong>24/7</strong>
                {t('discovery.localDiscovery')}
              </span>
            </div>
          </div>

          <div className="discovery-hero__art" aria-hidden="true">
            <Image
              src="/illustrations/hero-neighbourhood-mobile.webp"
              alt=""
              width="900"
              height="900"
              priority
            />
            <span className="discovery-pin">
              <Icon name="location" width="18" height="18" />
              {city.name}
            </span>
          </div>
        </div>
      </section>

      <div className="container discovery-body">
        {categories && categories.length > 0 ? (
          <section className="discovery-categories">
            <div className="section__head">
              <div>
                <span className="section-kicker">{t('discovery.startWithCategory')}</span>
                <h2>{t('feed.browseCategories')}</h2>
              </div>
              <Link href={`/search?cityId=${city.id}`} className="section-link">
                {t('feed.seeAll')} <Icon name="arrow" />
              </Link>
            </div>
            <nav className="discovery-category-grid" aria-label={t('feed.browseCategories')}>
              {categories.slice(0, 8).map((category, index) => (
                <Link
                  key={category.id}
                  href={`/c/${category.slug}`}
                  className={`discovery-category discovery-category--${(index % 4) + 1}`}
                >
                  <span>
                    <Image
                      src={premiumCategoryArtwork({ slug: category.slug, name: category.name })}
                      alt=""
                      width="76"
                      height="76"
                    />
                  </span>
                  <strong>{category.name}</strong>
                  <i aria-hidden="true">→</i>
                </Link>
              ))}
            </nav>
          </section>
        ) : null}

        <section className="discovery-results">
          <div className="section__head">
            <div>
              <span className="section-kicker">{t('discovery.freshIn', { city: city.name })}</span>
              <h2>{t('discovery.latestNearYou')}</h2>
            </div>
            <Link href={`/search?cityId=${city.id}&sort=newest`} className="section-link">
              {t('feed.seeAll')} <Icon name="arrow" />
            </Link>
          </div>

          {!result || result.items.length === 0 ? (
            <div className="empty-state discovery-empty">
              <Image
                className="empty-state__art"
                src="/illustrations/empty-neighbourhood.webp"
                alt=""
                width="280"
                height="230"
              />
              <h2>{t('discovery.beFirst', { city: city.name })}</h2>
              <p>{t('feed.empty')}</p>
              <Link href="/post" className="btn btn--primary">
                <Icon name="plus" width="18" height="18" /> {t('nav.post')}
              </Link>
            </div>
          ) : (
            <div className="card-grid discovery-results__grid">
              {result.items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} t={t} />
              ))}
            </div>
          )}
        </section>

        <aside className="discovery-community">
          <span className="discovery-community__icon">
            <Icon name="shield" width="23" height="23" />
          </span>
          <div>
            <strong>{t('discovery.communityTitle')}</strong>
            <p>{t('discovery.communityText')}</p>
          </div>
          <Link href="/safety">
            {t('discovery.safetyTips')} <Icon name="arrow" width="15" height="15" />
          </Link>
        </aside>
      </div>
    </>
  );
}
