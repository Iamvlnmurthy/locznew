import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Category, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { Icon, categoryImageName } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { ApiError, api, apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';

interface CategoryDetail extends Category {
  attributes: Array<{ key: string; label: string }>;
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

  return {
    title,
    description,
    alternates: { canonical: `/c/${category.slug}` },
    openGraph: { title, description, type: 'website' },
  };
}

/**
 * Category landing page — one of the two indexable surfaces (the other is city). Unlike
 * /search this is cached and crawlable, which is what makes it worth having separately.
 */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [locale, category, city] = await Promise.all([
    getLocale(),
    loadCategory(slug),
    getSelectedCity(),
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

  return (
    <>
      <section className="discovery-hero discovery-hero--category">
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

          <div className="discovery-hero__category-art" aria-hidden="true">
            <span>
              <Image
                src={`/icons/categories/${categoryImageName(category.iconKey)}.webp`}
                alt=""
                width="180"
                height="180"
                priority
              />
            </span>
            <i />
            <i />
          </div>
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
