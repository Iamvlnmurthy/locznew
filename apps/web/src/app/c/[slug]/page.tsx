import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Category, CategoryAttribute, ListingSummary, Paginated } from '@locz/shared-types';
import { publicBrandLogo } from '@locz/public-brands';
import { ListingCard } from '@/components/listing-card';
import { Icon } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { ApiError, api, apiSafe } from '@/lib/api';
import { premiumCategoryBanner } from '@/lib/premium-banner-catalog';
import { premiumCategoryArtwork } from '@/lib/premium-icon-catalog';
import { getLocale, getSelectedCity, localizedAlternates } from '@/lib/session';
import {
  PUBLIC_SERVICE_SLUGS,
  isPublicServiceSlug,
  publicServiceArtwork,
  publicServiceLabel,
  type PublicServiceSlug,
} from '@/lib/public-services';

interface CategoryDetail extends Category {
  attributes: CategoryAttribute[];
}

interface PublicBusinessSummary {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  pincode: string | null;
  addressLine: string | null;
  logoUrl: string | null;
  publicBrandKey: string | null;
  verificationStatus: string;
}

async function loadCategory(slug: string): Promise<CategoryDetail | null> {
  try {
    // Cached: category pages are the crawlable surface and change rarely.
    return await api<CategoryDetail>(`/categories/${encodeURIComponent(slug)}`, {
      revalidate: 3600,
      tags: ['categories'],
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [category, locale] = await Promise.all([loadCategory(slug).catch(() => null), getLocale()]);
  const t = getTranslator(locale);
  if (!category) {
    return {
      title: t('discovery.categoryNotFound'),
      robots: { index: false, follow: false },
    };
  }

  const localisedName =
    locale === 'te'
      ? (category.nameTe ?? category.name)
      : locale === 'hi'
        ? (category.nameHi ?? category.name)
        : category.name;
  const title = t('discovery.categoryMetadataTitle', { category: localisedName });
  const description = t('discovery.categoryMetadataDescription', {
    category: localisedName,
  });

  if (slug === 'public-services' || isPublicServiceSlug(slug)) {
    const publicTitle =
      slug === 'public-services'
        ? t('publicServices.directoryTitle')
        : t('publicServices.resultsTitleNational', {
            category: publicServiceLabel(t, slug),
          });
    return {
      title: publicTitle,
      description: t('publicServices.directorySubtitle'),
      alternates: await localizedAlternates(`/c/${category.slug}`),
      openGraph: {
        title: publicTitle,
        description: t('publicServices.directorySubtitle'),
        type: 'website',
      },
    };
  }

  return {
    title,
    description,
    alternates: await localizedAlternates(`/c/${category.slug}`),
    openGraph: { title, description, type: 'website' },
  };
}

/**
 * Category landing page — one of the two indexable surfaces (the other is city). Unlike
 * /search this is cached and crawlable, which is what makes it worth having separately.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const [locale, category, city, pageParams] = await Promise.all([
    getLocale(),
    loadCategory(slug),
    getSelectedCity(),
    searchParams,
  ]);

  if (!category) notFound();

  const t = getTranslator(locale);
  const query = new URLSearchParams({ categoryId: category.id, limit: '24' });
  if (city?.id) query.set('cityId', city.id);

  const result = await apiSafe<{ items: ListingSummary[]; total: number }>(
    `/search?${query.toString()}`,
    { revalidate: 120 },
  );

  const localisedName =
    locale === 'te'
      ? (category.nameTe ?? category.name)
      : locale === 'hi'
        ? (category.nameHi ?? category.name)
        : category.name;

  if (slug === 'public-services' || isPublicServiceSlug(slug)) {
    const page = Math.max(1, Number(pageParams.page ?? '1') || 1);
    const allCategories =
      (await apiSafe<Array<{ id: string; slug: string; name: string; count: number }>>(
        '/businesses/categories',
        { revalidate: 1800 },
      )) ?? [];
    const categoryBySlug = new Map(allCategories.map((item) => [item.slug, item]));

    if (slug === 'public-services') {
      return (
        <PublicServicesIndex
          locale={locale}
          cityName={city?.name ?? null}
          categories={PUBLIC_SERVICE_SLUGS.map((publicSlug) => ({
            slug: publicSlug,
            count: categoryBySlug.get(publicSlug)?.count ?? 0,
          }))}
        />
      );
    }

    const publicCategory = categoryBySlug.get(slug);
    const businessQuery = new URLSearchParams({
      categoryId: publicCategory?.id ?? category.id,
      page: String(page),
      limit: '24',
    });
    if (city?.id) businessQuery.set('cityId', city.id);
    const businesses = await apiSafe<Paginated<PublicBusinessSummary>>(
      `/businesses?${businessQuery.toString()}`,
      { revalidate: 300 },
    );
    return (
      <PublicServiceResults
        slug={slug}
        locale={locale}
        cityName={city?.name ?? null}
        businesses={businesses?.items ?? []}
        total={businesses?.meta.total ?? 0}
        page={page}
        hasMore={businesses?.meta.hasNextPage ?? false}
      />
    );
  }
  const categoryBanner = premiumCategoryBanner(category.name);

  return (
    <>
      <section
        className={`discovery-hero discovery-hero--category${categoryBanner ? ' has-category-banner' : ''}`}
      >
        {categoryBanner ? (
          <picture className="discovery-hero__banner">
            <source media="(max-width: 820px)" srcSet={categoryBanner.mobile} />
            <Image
              src={categoryBanner.desktop}
              alt=""
              width={2000}
              height={320}
              sizes="100vw"
              priority
            />
          </picture>
        ) : null}
        <div className="container discovery-hero__inner">
          <div className="discovery-hero__copy">
            <nav className="breadcrumbs breadcrumbs--light" aria-label={t('common.breadcrumb')}>
              <Link href="/">{t('nav.home')}</Link>
              <span>›</span>
              <span>{localisedName}</span>
            </nav>
            <span className="eyebrow">
              <i /> {t('discovery.categoryEyebrow')}
            </span>
            <h1>
              {city
                ? t('discovery.categoryTitleInCity', {
                    category: localisedName,
                    city: city.name,
                  })
                : localisedName}
            </h1>
            <p>{t('discovery.categorySubtitle', { category: localisedName })}</p>

            <form className="discovery-search" action="/search" method="get" role="search">
              <input type="hidden" name="categoryId" value={category.id} />
              {city?.id ? <input type="hidden" name="cityId" value={city.id} /> : null}
              <Icon name="search" width="20" height="20" />
              <label htmlFor="category-discovery-search" className="sr-only">
                {t('search.submit')}
              </label>
              <input
                id="category-discovery-search"
                name="q"
                type="search"
                placeholder={t('discovery.searchCategory', { category: localisedName })}
              />
              <button type="submit">
                {t('search.submit')} <Icon name="arrow" width="16" height="16" />
              </button>
            </form>

            <div className="discovery-hero__proof">
              <span>
                <strong>{result?.total.toLocaleString(`${locale}-IN`) ?? '0'}</strong>
                {t('discovery.matches')}
              </span>
              <span>
                <strong>{t('listing.free')}</strong>
                {t('discovery.toList')}
              </span>
              <span>
                <strong>{city?.name ?? t('location.nearby')}</strong>
                {t('discovery.searchArea')}
              </span>
            </div>
          </div>

          {!categoryBanner ? (
            <div className="discovery-hero__category-art" aria-hidden="true">
              <span>
                <Image
                  src={premiumCategoryArtwork({ slug: category.slug, name: category.name })}
                  alt=""
                  width="180"
                  height="180"
                  priority
                />
              </span>
              <i />
              <i />
            </div>
          ) : null}
        </div>
      </section>

      <div className="container discovery-body">
        {category.children && category.children.length > 0 ? (
          <nav className="subcategory-grid" aria-label={localisedName}>
            {category.children.map((child) => (
              <Link key={child.id} href={`/c/${child.slug}`}>
                <span>{child.name}</span>
                <Icon name="arrow" width="16" height="16" />
              </Link>
            ))}
          </nav>
        ) : null}

        <section className="discovery-results">
          <div className="section__head">
            <div>
              <span className="section-kicker">
                {city ? t('discovery.freshIn', { city: city.name }) : t('home.freshNearby')}
              </span>
              <h2>{t('discovery.latestCategory', { category: localisedName })}</h2>
            </div>
            <Link
              href={`/search?categoryId=${category.id}${city?.id ? `&cityId=${city.id}` : ''}`}
              className="section-link"
            >
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
              <h2>{t('discovery.noCategoryYet', { category: localisedName })}</h2>
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

function PublicServicesIndex({
  locale,
  cityName,
  categories,
}: {
  locale: 'en' | 'te' | 'hi';
  cityName: string | null;
  categories: Array<{ slug: PublicServiceSlug; count: number }>;
}) {
  const t = getTranslator(locale);
  return (
    <main className="public-services-page">
      <PublicServicesHero
        artwork="/icons/public-services/public-services.webp"
        breadcrumbLabel={t('publicServices.breadcrumb')}
        eyebrow={t('publicServices.directoryKicker')}
        title={t('publicServices.directoryTitle')}
        subtitle={t('publicServices.directorySubtitle')}
        context={
          cityName
            ? t('publicServices.availableIn', { city: cityName })
            : t('publicServices.nationalDirectory')
        }
      />
      <section
        className="container public-services-directory"
        aria-label={t('publicServices.directoryTitle')}
      >
        {categories.map(({ slug, count }) => (
          <Link href={`/c/${slug}`} className="public-services-directory-card" key={slug}>
            <span className="public-services-directory-card__icon" aria-hidden="true">
              <Image src={publicServiceArtwork(slug)} alt="" width={64} height={64} />
            </span>
            <span>
              <strong>{publicServiceLabel(t, slug)}</strong>
              <small>
                {t('publicServices.locations', { count: count.toLocaleString(`${locale}-IN`) })}
              </small>
            </span>
            <Icon name="arrow" />
          </Link>
        ))}
      </section>
    </main>
  );
}

function PublicServiceResults({
  slug,
  locale,
  cityName,
  businesses,
  total,
  page,
  hasMore,
}: {
  slug: PublicServiceSlug;
  locale: 'en' | 'te' | 'hi';
  cityName: string | null;
  businesses: PublicBusinessSummary[];
  total: number;
  page: number;
  hasMore: boolean;
}) {
  const t = getTranslator(locale);
  const label = publicServiceLabel(t, slug);
  const title = cityName
    ? t('publicServices.resultsTitle', { category: label, city: cityName })
    : t('publicServices.resultsTitleNational', { category: label });
  return (
    <main className="public-services-page">
      <PublicServicesHero
        artwork={publicServiceArtwork(slug)}
        breadcrumbLabel={t('publicServices.breadcrumb')}
        eyebrow={t('publicServices.directoryKicker')}
        title={title}
        subtitle={t('publicServices.directorySubtitle')}
        context={t('publicServices.locations', { count: total.toLocaleString(`${locale}-IN`) })}
      />
      <section
        className="container public-service-results"
        aria-labelledby="public-service-results-title"
      >
        <div className="public-service-results__head">
          <div>
            <span className="section-kicker">
              {cityName
                ? t('publicServices.availableIn', { city: cityName })
                : t('publicServices.nationalDirectory')}
            </span>
            <h2 id="public-service-results-title">{label}</h2>
          </div>
          <Link href="/c/public-services" className="section-link">
            {t('publicServices.directoryTitle')} <Icon name="arrow" />
          </Link>
        </div>
        {businesses.length ? (
          <div className="public-service-results__grid">
            {businesses.map((business) => {
              const logo =
                business.logoUrl ?? publicBrandLogo(business.name, business.publicBrandKey);
              return (
                <Link
                  href={`/b/${business.slug}`}
                  className="public-service-result-card"
                  key={business.id}
                >
                  <span className="public-service-result-card__icon" aria-hidden="true">
                    {logo ? (
                      <Image src={logo} alt="" width={58} height={58} />
                    ) : (
                      <Image src={publicServiceArtwork(slug)} alt="" width={58} height={58} />
                    )}
                  </span>
                  <span className="public-service-result-card__body">
                    <small>{label}</small>
                    <strong>{business.name}</strong>
                    <span>
                      <Icon name="location" />
                      {[business.addressLine, business.cityName, business.pincode]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="public-service-result-card__action">
                    {t('publicServices.viewLocation')} <Icon name="arrow" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="public-service-results__empty">
            <Image src={publicServiceArtwork(slug)} alt="" width={88} height={88} />
            <h2>{t('publicServices.noResults')}</h2>
            <Link href="/c/public-services">{t('publicServices.directoryTitle')}</Link>
          </div>
        )}
        {page > 1 || hasMore ? (
          <nav className="news-pagination" aria-label={t('publicServices.pagination')}>
            {page > 1 ? (
              <Link
                className="news-pagination__link news-pagination__link--prev"
                href={`?page=${page - 1}`}
              >
                <Icon name="arrow" /> {t('publicServices.previous')}
              </Link>
            ) : (
              <span />
            )}
            <span className="news-pagination__page">{t('publicServices.page', { page })}</span>
            {hasMore ? (
              <Link className="news-pagination__link" href={`?page=${page + 1}`}>
                {t('publicServices.more')} <Icon name="arrow" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function PublicServicesHero({
  artwork,
  breadcrumbLabel,
  eyebrow,
  title,
  subtitle,
  context,
}: {
  artwork: string;
  breadcrumbLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  context: string;
}) {
  return (
    <header className="public-services-hero">
      <div className="container public-services-hero__inner">
        <div className="public-services-hero__copy">
          <nav className="breadcrumbs breadcrumbs--light" aria-label={breadcrumbLabel}>
            <Link href="/">LocZ</Link>
            <span>›</span>
            <Link href="/c/public-services">{eyebrow}</Link>
          </nav>
          <span className="eyebrow">
            <i /> {eyebrow}
          </span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <span className="public-services-hero__context">
            <Icon name="location" /> {context}
          </span>
        </div>
        <span className="public-services-hero__emblem" aria-hidden="true">
          <Image src={artwork} alt="" width={210} height={210} sizes="210px" priority />
        </span>
      </div>
    </header>
  );
}
