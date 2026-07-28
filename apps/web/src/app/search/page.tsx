import type { Metadata } from 'next';
import Link from 'next/link';
import type { Category, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { Icon } from '@/components/icons';
import { getMessageGroup, getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';
import { SearchFilters } from './search-filters';
import { SearchSort } from './search-sort';
import { RecentSearchInput } from '@/components/recent-search-input';

interface SearchResult {
  items: ListingSummary[];
  total: number;
  page: number;
  limit: number;
  usedSearchIndex: boolean;
}

export const metadata: Metadata = {
  title: 'Search',
  // Search result pages are thin, near-duplicate content — useful to users, harmful in
  // an index. The city and category landing pages are the crawlable surface instead.
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = getTranslator(locale);
  const s = getMessageGroup(locale, 'searchUi');
  const city = await getSelectedCity();

  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const query = new URLSearchParams({ page: String(page), limit: '24' });

  for (const key of [
    'q',
    'type',
    'categoryId',
    'localityId',
    'priceMin',
    'priceMax',
    'condition',
    'postedWithinDays',
    'verifiedOnly',
    'sort',
  ] as const) {
    if (params[key]) query.set(key, params[key]!);
  }

  const cityId = params.cityId ?? city?.id;
  if (cityId) query.set('cityId', cityId);

  // The API resolves the pincode to its centroid and searches outward from there, so a
  // pincode narrows results the same way a radius does — no special case here.
  const pincode = params.pincode ?? city?.pincode;
  if (pincode) query.set('pincode', pincode);

  if (params.radiusKm && city?.latitude && city?.longitude) {
    query.set('radiusKm', params.radiusKm);
    query.set('latitude', String(city.latitude));
    query.set('longitude', String(city.longitude));
  }

  const [result, categories] = await Promise.all([
    apiSafe<SearchResult>(`/search?${query.toString()}`, { auth: true }),
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
  ]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  const activeFilters = buildActiveFilters(params, categories ?? [], s);
  const resultCount = result?.total ?? 0;
  const visibleResultCount = result?.items.length ?? 0;
  const isSparse = visibleResultCount > 0 && visibleResultCount <= 2;
  const resultHeading = params.q
    ? (resultCount === 1 ? s.resultForOne : s.resultsForMany)
        .replace('{count}', String(resultCount))
        .replace('{query}', params.q)
    : t('search.placeholder');
  const localMatchHeading = (resultCount === 1 ? s.localMatchOne : s.localMatchesMany).replace(
    '{count}',
    String(resultCount),
  );

  return (
    <>
      <section className="search-page__hero">
        <div className="container">
          <span className="section-kicker">{city?.name ?? t('location.nearby')}</span>
          <h1>{resultHeading}</h1>

          <form className="search-page__query" action="/search" method="get" role="search">
            <Icon name="search" width="21" height="21" />
            <label htmlFor="results-search" className="sr-only">
              {t('search.submit')}
            </label>
            <RecentSearchInput
              id="results-search"
              defaultValue={params.q ?? ''}
              placeholder={t('search.placeholder')}
              autoFocus={!params.q}
              recentLabel={s.recentSearches}
              clearLabel={s.clearRecent}
            />
            <button type="submit">
              {t('search.submit')} <Icon name="arrow" />
            </button>
          </form>

          <nav className="search-type-tabs" aria-label={s.listingType}>
            {[
              ['', s.everything, 'sparkles'],
              ['PRODUCT', s.forSale, 'tag'],
              ['JOB', s.jobs, 'briefcase'],
              ['OFFER', s.offers, 'store'],
              ['SERVICE', s.services, 'tools'],
              ['RENTAL', s.rentals, 'homeCategory'],
            ].map(([value, label, icon]) => (
              <Link
                key={value}
                href={buildFilterHref(params, 'type', value)}
                className={params.type === value || (!params.type && !value) ? 'is-active' : ''}
              >
                <Icon name={icon} />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <div className="container">
        {activeFilters.length ? (
          <div className="search-active-filters" aria-label={s.activeFilters}>
            <span>{s.refinedBy}</span>
            <div>
              {activeFilters.map((filter) => (
                <Link key={filter.key} href={buildFilterHref(params, filter.key, '')}>
                  {filter.label} <span aria-hidden="true">×</span>
                </Link>
              ))}
            </div>
            <Link href={clearRefinementsHref(params)}>{s.clearFilters}</Link>
          </div>
        ) : null}

        <div className="results-layout">
          <SearchFilters
            categories={categories ?? []}
            values={{
              q: params.q,
              type: params.type,
              categoryId: params.categoryId,
              priceMin: params.priceMin,
              priceMax: params.priceMax,
              condition: params.condition,
              radiusKm: params.radiusKm,
              postedWithinDays: params.postedWithinDays,
              verifiedOnly: params.verifiedOnly,
            }}
            labels={s}
          />

          <div className={`search-results${isSparse ? ' search-results--sparse' : ''}`}>
            <div className="search-results__toolbar">
              <div>
                <strong>{localMatchHeading}</strong>
                <span>
                  {city?.name ? s.aroundCity.replace('{city}', city.name) : s.availableLocations}
                  {result?.usedSearchIndex ? ` · ${s.bestMatch}` : ` · ${s.latestFirst}`}
                </span>
              </div>
              <SearchSort value={params.sort ?? 'relevance'} labels={s} />
            </div>

            {!result || result.items.length === 0 ? (
              <div className="empty-state search-empty">
                <img
                  className="empty-state__art"
                  src="/illustrations/empty-neighbourhood.webp"
                  alt=""
                  width="280"
                  height="230"
                />
                <span className="section-kicker">{s.noExactMatch}</span>
                <h2>{t('search.noResults')}</h2>
                <p>{t('search.noResultsHint')}</p>
                <div>
                  <Link href={clearRefinementsHref(params)} className="btn btn--primary">
                    {s.widenSearch}
                  </Link>
                  <Link href="/post" className="btn btn--outline">
                    {s.postNeed}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="search-results__reassurance">
                  <Icon name="shield" />
                  <p>
                    <strong>{s.safetyTitle}</strong> {s.safetyBody}
                  </p>
                  <Link href="/safety">
                    {s.safetyTips} <Icon name="arrow" />
                  </Link>
                </div>
                <div className={`card-grid${isSparse ? ' card-grid--sparse' : ''}`}>
                  {result.items.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      t={t}
                      variant={isSparse ? 'wide' : 'standard'}
                    />
                  ))}
                </div>

                {totalPages > 1 ? (
                  <nav className="search-pagination" aria-label={s.pagination}>
                    {page > 1 ? (
                      <Link className="btn btn--outline" href={buildPageHref(params, page - 1)}>
                        ← {t('common.back')}
                      </Link>
                    ) : null}
                    <span>
                      {s.pageOf
                        .replace('{page}', String(page))
                        .replace('{total}', String(totalPages))}
                    </span>
                    {page < totalPages ? (
                      <Link className="btn btn--outline" href={buildPageHref(params, page + 1)}>
                        {t('common.next')} →
                      </Link>
                    ) : null}
                  </nav>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function buildFilterHref(
  params: Record<string, string | undefined>,
  key: string,
  value: string,
): string {
  const next = new URLSearchParams();
  for (const [paramKey, paramValue] of Object.entries(params)) {
    if (paramValue && paramKey !== 'page' && paramKey !== key) next.set(paramKey, paramValue);
  }
  if (value) next.set(key, value);
  return `/search?${next.toString()}`;
}

function buildPageHref(params: Record<string, string | undefined>, page: number): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'page') next.set(key, value);
  }
  next.set('page', String(page));
  return `/search?${next.toString()}`;
}

function buildActiveFilters(
  params: Record<string, string | undefined>,
  categories: Category[],
  labels: Record<string, string>,
): Array<{ key: string; label: string }> {
  const filters: Array<{ key: string; label: string }> = [];
  if (params.categoryId) {
    filters.push({
      key: 'categoryId',
      label:
        categories.find((category) => category.id === params.categoryId)?.name ?? labels.category,
    });
  }
  if (params.priceMin)
    filters.push({ key: 'priceMin', label: labels.fromPrice.replace('{price}', params.priceMin) });
  if (params.priceMax)
    filters.push({ key: 'priceMax', label: labels.upToPrice.replace('{price}', params.priceMax) });
  if (params.condition) {
    filters.push({ key: 'condition', label: humaniseFilter(params.condition, labels) });
  }
  if (params.radiusKm)
    filters.push({ key: 'radiusKm', label: labels.withinKm.replace('{km}', params.radiusKm) });
  if (params.postedWithinDays) {
    const postedLabels: Record<string, string> = {
      '1': labels.postedToday,
      '7': labels.postedWeek,
      '30': labels.postedMonth,
    };
    filters.push({
      key: 'postedWithinDays',
      label: postedLabels[params.postedWithinDays] ?? labels.recentlyPosted,
    });
  }
  if (params.verifiedOnly === 'true') {
    filters.push({ key: 'verifiedOnly', label: labels.verifiedBusinesses });
  }
  return filters;
}

function clearRefinementsHref(params: Record<string, string | undefined>): string {
  const next = new URLSearchParams();
  if (params.q) next.set('q', params.q);
  if (params.type) next.set('type', params.type);
  return `/search?${next.toString()}`;
}

function humaniseFilter(value: string, labels: Record<string, string>): string {
  const conditions: Record<string, string> = {
    NEW: labels.conditionNew,
    LIKE_NEW: labels.conditionLikeNew,
    GOOD: labels.conditionGood,
    FAIR: labels.conditionFair,
    FOR_PARTS: labels.conditionParts,
  };
  return conditions[value] ?? value;
}
