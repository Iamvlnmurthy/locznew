import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { Category, City, Paginated } from '@locz/shared-types';
import { CityCombobox } from '@/components/city-combobox';
import { Icon, categoryImageName } from '@/components/icons';
import { getTranslator, type Locale, type Translator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return {
    title: t('businessDirectory.metadataTitle'),
    description: t('businessDirectory.metadataDescription'),
    alternates: { canonical: '/business' },
  };
}

interface BusinessHour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  logoUrl: string | null;
  verificationStatus: string;
  listingCount: number;
  viewCount: number;
  description: string | null;
  addressLine: string | null;
  hours: BusinessHour[];
}

type DirectoryParams = {
  q?: string;
  cityId?: string;
  categoryId?: string;
  verifiedOnly?: string;
  sort?: string;
  page?: string;
};

export default async function BusinessDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<DirectoryParams>;
}) {
  const [params, selectedCity, cities, categories, locale] = await Promise.all([
    searchParams,
    getSelectedCity(),
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
    getLocale(),
  ]);
  const t = getTranslator(locale);

  const explicitlyAllCities = params.cityId === 'all' || params.cityId === '';
  const activeCityId = explicitlyAllCities
    ? undefined
    : (params.cityId ?? selectedCity?.id ?? undefined);
  const query = new URLSearchParams({ limit: '12', page: params.page ?? '1' });
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (activeCityId) query.set('cityId', activeCityId);
  if (params.categoryId) query.set('categoryId', params.categoryId);
  if (params.verifiedOnly === 'true') query.set('verifiedOnly', 'true');
  if (['popular', 'newest'].includes(params.sort ?? '')) query.set('sort', params.sort!);

  const result = await apiSafe<Paginated<BusinessSummary>>(`/businesses?${query.toString()}`);
  const businesses = result?.items ?? [];
  const topCategories = (categories ?? []).filter((category) => !category.parentId);
  let activeCity = (cities ?? []).find((city) => city.id === activeCityId);
  if (activeCityId && !activeCity) {
    activeCity = (
      await apiSafe<City[]>(`/locations/cities?id=${encodeURIComponent(activeCityId)}&limit=1`, {
        revalidate: 3600,
      })
    )?.[0];
  }
  const activeCategory = topCategories.find((category) => category.id === params.categoryId);
  const areaLabel =
    activeCity?.name ??
    (explicitlyAllCities
      ? t('businessDirectory.allLiveCitiesInline')
      : t('businessDirectory.nearYou'));
  const hasFilters = Boolean(
    params.q || params.categoryId || params.verifiedOnly || explicitlyAllCities,
  );

  return (
    <div className="business-directory">
      <section className="business-directory-hero">
        <div className="container business-directory-hero__inner">
          <div className="business-directory-hero__copy">
            <span className="eyebrow">
              <i /> {t('businessDirectory.eyebrow')}
            </span>
            <h1>{t('businessDirectory.title')}</h1>
            <p>{t('businessDirectory.subtitle')}</p>

            <form
              className="business-directory-search"
              action="/business"
              method="get"
              role="search"
            >
              <Icon name="search" width="21" height="21" />
              <label className="sr-only" htmlFor="business-search">
                {t('businessDirectory.searchLabel')}
              </label>
              <input
                id="business-search"
                name="q"
                type="search"
                defaultValue={params.q ?? ''}
                placeholder={t('businessDirectory.searchPlaceholder', { area: areaLabel })}
              />
              {activeCityId ? <input type="hidden" name="cityId" value={activeCityId} /> : null}
              <button type="submit">
                {t('businessDirectory.findNearby')} <Icon name="arrow" width="16" height="16" />
              </button>
            </form>

            <div className="business-directory-hero__trust">
              <span>
                <Icon name="shield" /> {t('businessDirectory.trustVerification')}
              </span>
              <span>
                <Icon name="message" /> {t('businessDirectory.trustPrivate')}
              </span>
              <span>
                <Icon name="plus" /> {t('businessDirectory.trustFree')}
              </span>
            </div>
          </div>

          <div className="business-directory-hero__art" aria-hidden="true">
            <span className="business-directory-hero__shop">
              <Image
                src="/icons/categories/business.webp"
                alt=""
                width="250"
                height="250"
                priority
              />
            </span>
            <span className="business-directory-hero__note business-directory-hero__note--one">
              <Icon name="shield" /> {t('businessDirectory.verifiedDetails')}
            </span>
            <span className="business-directory-hero__note business-directory-hero__note--two">
              <Icon name="location" /> {t('businessDirectory.closeToHome')}
            </span>
          </div>
        </div>
      </section>

      <div className="container business-directory-body">
        <section className="business-directory-start" aria-labelledby="business-start-title">
          <div>
            <span className="section-kicker">{t('businessDirectory.categoryKicker')}</span>
            <h2 id="business-start-title">{t('businessDirectory.categoryTitle')}</h2>
          </div>
          <nav aria-label={t('businessDirectory.categoryAria')}>
            {topCategories.slice(0, 8).map((category, index) => (
              <Link
                key={category.id}
                href={directoryHref(params, { categoryId: category.id, page: undefined })}
                className={category.id === params.categoryId ? 'is-active' : ''}
              >
                <span className={`business-directory-start__icon is-tone-${(index % 4) + 1}`}>
                  <Image
                    src={`/icons/categories/${categoryImageName(category.iconKey)}.webp`}
                    alt=""
                    width="58"
                    height="58"
                  />
                </span>
                <strong>{category.name}</strong>
              </Link>
            ))}
          </nav>
        </section>

        <section className="business-directory-results" aria-labelledby="business-results-title">
          <aside className="business-directory-filters">
            <form action="/business" method="get">
              {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
              <div className="business-directory-filters__head">
                <div>
                  <span className="section-kicker">{t('businessDirectory.filtersKicker')}</span>
                  <h2>{t('businessDirectory.filtersTitle')}</h2>
                </div>
                {hasFilters ? <Link href="/business">{t('businessDirectory.reset')}</Link> : null}
              </div>

              <label>
                <span>{t('businessDirectory.area')}</span>
                <CityCombobox
                  id="business-city-filter"
                  cities={cities ?? []}
                  defaultValue={explicitlyAllCities ? '' : (activeCityId ?? '')}
                  defaultLabel={
                    activeCity
                      ? `${activeCity.name}, ${activeCity.stateName}`
                      : t('businessDirectory.allLiveCities')
                  }
                  placeholder={t('location.searchCity')}
                  noResultsLabel={t('location.noCityMatches')}
                />
                <small>{t('businessDirectory.allLiveCities')}</small>
              </label>

              <label>
                <span>{t('businessDirectory.category')}</span>
                <select name="categoryId" defaultValue={params.categoryId ?? ''}>
                  <option value="">{t('businessDirectory.everyCategory')}</option>
                  {topCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>{t('businessDirectory.order')}</span>
                <select name="sort" defaultValue={params.sort ?? 'recommended'}>
                  <option value="recommended">{t('businessDirectory.recommended')}</option>
                  <option value="popular">{t('businessDirectory.mostViewed')}</option>
                  <option value="newest">{t('businessDirectory.recentlyJoined')}</option>
                </select>
              </label>

              <label className="business-directory-filters__check">
                <input
                  type="checkbox"
                  name="verifiedOnly"
                  value="true"
                  defaultChecked={params.verifiedOnly === 'true'}
                />
                <span>
                  <Icon name="shield" />
                </span>
                <span>
                  <strong>{t('businessDirectory.verifiedOnly')}</strong>
                  {t('businessDirectory.verifiedOnlyBody')}
                </span>
              </label>

              <button type="submit" className="btn btn--primary btn--block">
                {t('businessDirectory.showBusinesses')}
              </button>
            </form>

            <div className="business-directory-owner-note">
              <span>
                <Icon name="store" />
              </span>
              <div>
                <strong>{t('businessDirectory.ownerTitle')}</strong>
                <p>{t('businessDirectory.ownerBody')}</p>
                <Link href="/business/new">
                  {t('businessDirectory.listFree')} <Icon name="arrow" />
                </Link>
              </div>
            </div>
          </aside>

          <div className="business-directory-results__main">
            <div className="business-directory-results__head">
              <div>
                <span className="section-kicker">{t('businessDirectory.resultsKicker')}</span>
                <h2 id="business-results-title">
                  {t(
                    activeCategory
                      ? 'businessDirectory.categoryResults'
                      : 'businessDirectory.localResults',
                    { category: activeCategory?.name ?? '', area: areaLabel },
                  )}
                </h2>
                <p>{t('businessDirectory.resultsBody')}</p>
              </div>
              <span>
                <strong>{result?.meta.total ?? 0}</strong>
                {t(
                  result?.meta.total === 1
                    ? 'businessDirectory.businessSingular'
                    : 'businessDirectory.businessPlural',
                )}
              </span>
            </div>

            {businesses.length > 0 ? (
              <div className="business-directory-grid">
                {businesses.map((business) => (
                  <BusinessCard key={business.id} business={business} locale={locale} t={t} />
                ))}
              </div>
            ) : (
              <div className="business-directory-empty">
                <Image
                  src="/illustrations/empty-neighbourhood.webp"
                  alt=""
                  width="250"
                  height="205"
                />
                <span className="section-kicker">{t('businessDirectory.emptyKicker')}</span>
                <h2>{t('businessDirectory.emptyTitle')}</h2>
                <p>{t('businessDirectory.emptyBody')}</p>
                <div>
                  <Link href="/business" className="btn btn--outline">
                    {t('businessDirectory.showAll')}
                  </Link>
                  <Link href="/business/new" className="btn btn--primary">
                    {t('businessDirectory.listBusiness')}
                  </Link>
                </div>
              </div>
            )}

            {result && result.meta.totalPages > 1 ? (
              <nav
                className="business-directory-pagination"
                aria-label={t('businessDirectory.paginationAria')}
              >
                {result.meta.page > 1 ? (
                  <Link href={directoryHref(params, { page: String(result.meta.page - 1) })}>
                    <Icon name="chevronLeft" /> {t('businessDirectory.previous')}
                  </Link>
                ) : (
                  <span />
                )}
                <span>
                  {t('businessDirectory.pageOf', {
                    page: result.meta.page,
                    total: result.meta.totalPages,
                  })}
                </span>
                {result.meta.hasNextPage ? (
                  <Link href={directoryHref(params, { page: String(result.meta.page + 1) })}>
                    {t('businessDirectory.next')} <Icon name="chevronRight" />
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function BusinessCard({
  business,
  locale,
  t,
}: {
  business: BusinessSummary;
  locale: Locale;
  t: Translator;
}) {
  const openState = currentOpenState(business.hours, locale, t);
  return (
    <article className="business-directory-card">
      <div className="business-directory-card__top">
        <span className="business-directory-card__logo">
          {business.logoUrl ? (
            <Image src={business.logoUrl} alt="" width="72" height="72" />
          ) : (
            business.name.slice(0, 1).toUpperCase()
          )}
        </span>
        <div className="business-directory-card__badges">
          {business.verificationStatus === 'VERIFIED' ? (
            <span className="is-verified">
              <Icon name="shield" /> {t('businessDirectory.verified')}
            </span>
          ) : (
            <span>
              <Icon name="store" /> {t('businessDirectory.local')}
            </span>
          )}
          <span className={openState.isOpen ? 'is-open' : ''}>
            <i /> {openState.label}
          </span>
        </div>
      </div>
      <div className="business-directory-card__body">
        <span className="section-kicker">{business.categoryName}</span>
        <h3>
          <Link href={`/b/${business.slug}`}>{business.name}</Link>
        </h3>
        <p className="business-directory-card__place">
          <Icon name="location" /> {business.addressLine ? `${business.addressLine}, ` : ''}
          {business.cityName}
        </p>
        <p className="business-directory-card__description">
          {business.description ?? t('businessDirectory.cardFallback')}
        </p>
      </div>
      <div className="business-directory-card__foot">
        <span>
          <strong>{business.listingCount}</strong>{' '}
          {t(
            business.listingCount === 1
              ? 'businessDirectory.liveListing'
              : 'businessDirectory.liveListings',
          )}
        </span>
        <span>
          <strong>{business.viewCount.toLocaleString(`${locale}-IN`)}</strong>{' '}
          {t(
            business.viewCount === 1
              ? 'businessDirectory.profileView'
              : 'businessDirectory.profileViews',
          )}
        </span>
        <Link href={`/b/${business.slug}`}>
          {t('businessDirectory.viewProfile')} <Icon name="arrow" />
        </Link>
      </div>
    </article>
  );
}

function currentOpenState(
  hours: BusinessHour[],
  locale: Locale,
  t: Translator,
): { isOpen: boolean; label: string } {
  if (!hours.length) {
    return { isOpen: false, label: t('businessDirectory.hoursNotListed') };
  }
  const now = new Date();
  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(now);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const today = hours.filter((hour) => hour.dayOfWeek === weekday && !hour.isClosed);
  const open = today.find((hour) => time >= hour.opensAt && time <= hour.closesAt);
  if (open) {
    return {
      isOpen: true,
      label: t('businessDirectory.openUntil', { time: formatClock(open.closesAt, locale) }),
    };
  }
  const next = today.find((hour) => time < hour.opensAt);
  return {
    isOpen: false,
    label: next
      ? t('businessDirectory.opensAt', { time: formatClock(next.opensAt, locale) })
      : t('businessDirectory.closedToday'),
  };
}

function formatClock(value: string, locale: Locale): string {
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date(2020, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(`${locale}-IN`, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function directoryHref(
  current: DirectoryParams,
  changes: Partial<Record<keyof DirectoryParams, string | undefined>>,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) {
    if (value) next.set(key, value);
  }
  return `/business${next.size ? `?${next.toString()}` : ''}`;
}
