import type { Metadata } from 'next';
import Link from 'next/link';
import type { Category, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { Icon } from '@/components/icons';
import { getMessageGroup, getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import {
  categoryAttributeLabel,
  categoryAttributeOptionLabel,
  findCategory,
  hydrateCategoryAttributes,
} from '@/lib/category-attributes';
import { getLocale, getSelectedCity } from '@/lib/session';
import { SearchFilters } from './search-filters';
import { SearchSort } from './search-sort';
import { NearbyBusinesses } from './nearby-businesses';
import { loadNearbyBusinesses } from './businesses-actions';
import { RecentSearchInput } from '@/components/recent-search-input';

interface SearchResult {
  items: ListingSummary[];
  total: number;
  page: number;
  limit: number;
  usedSearchIndex: boolean;
  businesses: BusinessSearchResult[];
  businessTotal: number;
}

interface BusinessSearchResult {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  localityName: string | null;
  cityName: string | null;
  isVerified: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: 'Search',
  // Search result pages are thin, near-duplicate content — useful to users, harmful in
  // an index. The city and category landing pages are the crawlable surface instead.
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;
  const params = Object.fromEntries(
    Object.entries(rawParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  ) as Record<string, string | undefined>;
  const attributeParams = valuesFor(rawParams.attr);
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
  for (const attribute of attributeParams) query.append('attr', attribute);

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

  const [result, categoryTree] = await Promise.all([
    apiSafe<SearchResult>(`/search?${query.toString()}`, { auth: true }),
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
  ]);
  const categories = await hydrateCategoryAttributes(categoryTree ?? []);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  const activeFilters = buildActiveFilters(rawParams, categories, s, locale);
  const resultCount = result?.total ?? 0;
  const visibleResultCount = result?.items.length ?? 0;
  // "Places nearby" is a paginated, infinite-scroll list — 20 at a time, pulled as the user
  // scrolls. With coordinates it uses the geo endpoint so each card shows an exact distance.
  const bizLat = city?.latitude;
  const bizLon = city?.longitude;
  const bizRadiusKm = params.radiusKm ? Number(params.radiusKm) : undefined;
  const businessPage =
    (bizLat !== undefined && bizLon !== undefined) || pincode || cityId
      ? await loadNearbyBusinesses({
          q: params.q,
          pincode,
          cityId,
          latitude: bizLat,
          longitude: bizLon,
          radiusKm: bizRadiusKm,
          page: 1,
        })
      : { items: [], total: 0, page: 1, hasNextPage: false };
  const businessTotal = businessPage.total;
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
                href={buildFilterHref(rawParams, 'type', value)}
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
                <Link
                  key={`${filter.key}-${filter.value ?? ''}`}
                  href={buildFilterHref(rawParams, filter.key, '', filter.value)}
                >
                  {filter.label} <span aria-hidden="true">×</span>
                </Link>
              ))}
            </div>
            <Link href={clearRefinementsHref(rawParams)}>{s.clearFilters}</Link>
          </div>
        ) : null}

        <div className="results-layout">
          <SearchFilters
            categories={categories}
            locale={locale}
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
              attrs: attributeParams,
            }}
            labels={s}
          />

          <div className={`search-results${isSparse ? ' search-results--sparse' : ''}`}>
            {businessPage.items.length > 0 ? (
              <section className="search-businesses" aria-labelledby="search-businesses-title">
                <div className="search-businesses__head">
                  <div>
                    <span className="section-kicker">{s.businessesKicker}</span>
                    <h2 id="search-businesses-title">{s.businessesTitle}</h2>
                    <p>
                      {(businessTotal === 1 ? s.businessCountOne : s.businessCountMany).replace(
                        '{count}',
                        String(businessTotal),
                      )}
                    </p>
                  </div>
                </div>
                <NearbyBusinesses
                  q={params.q}
                  pincode={pincode}
                  cityId={cityId}
                  latitude={bizLat}
                  longitude={bizLon}
                  radiusKm={bizRadiusKm}
                  initial={businessPage.items}
                  initialHasMore={businessPage.hasNextPage}
                  verifiedLabel={s.businessVerified}
                  claimLabel={s.businessClaim}
                  nearYou={s.nearYou}
                  loadingLabel={s.loadingMoreBusinesses}
                  kmLabel={t('common.km')}
                  withinKm={s.withinKm}
                />
              </section>
            ) : null}

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
                  <Link href={clearRefinementsHref(rawParams)} className="btn btn--primary">
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
                      <Link className="btn btn--outline" href={buildPageHref(rawParams, page - 1)}>
                        ← {t('common.back')}
                      </Link>
                    ) : null}
                    <span>
                      {s.pageOf
                        .replace('{page}', String(page))
                        .replace('{total}', String(totalPages))}
                    </span>
                    {page < totalPages ? (
                      <Link className="btn btn--outline" href={buildPageHref(rawParams, page + 1)}>
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
  params: SearchParams,
  key: string,
  value: string,
  removeValue?: string,
): string {
  const next = new URLSearchParams();
  for (const [paramKey, paramValue] of Object.entries(params)) {
    if (paramKey === 'page' || (paramKey === key && removeValue === undefined)) continue;
    for (const item of valuesFor(paramValue)) {
      if (paramKey !== key || item !== removeValue) next.append(paramKey, item);
    }
  }
  if (value) next.append(key, value);
  return `/search?${next.toString()}`;
}

function buildPageHref(params: SearchParams, page: number): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'page') continue;
    for (const item of valuesFor(value)) next.append(key, item);
  }
  next.set('page', String(page));
  return `/search?${next.toString()}`;
}

function buildActiveFilters(
  rawParams: SearchParams,
  categories: Category[],
  labels: Record<string, string>,
  locale: 'en' | 'hi' | 'te',
): Array<{ key: string; label: string; value?: string }> {
  const params = Object.fromEntries(
    Object.entries(rawParams).map(([key, value]) => [key, valuesFor(value)[0]]),
  ) as Record<string, string | undefined>;
  const filters: Array<{ key: string; label: string; value?: string }> = [];
  if (params.categoryId) {
    filters.push({
      key: 'categoryId',
      label: findCategory(categories, params.categoryId)?.name ?? labels.category,
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
  const selectedCategory = params.categoryId
    ? findCategory(categories, params.categoryId)
    : undefined;
  for (const encoded of valuesFor(rawParams.attr)) {
    const separator = encoded.indexOf(':');
    const key = separator === -1 ? encoded : encoded.slice(0, separator);
    const value = separator === -1 ? '' : encoded.slice(separator + 1);
    const attribute = selectedCategory?.attributes?.find((candidate) => candidate.key === key);
    const option = attribute?.options?.find((candidate) => candidate.value === value);
    const attributeName = attribute ? categoryAttributeLabel(attribute, locale) : key;
    const displayValue = option ? categoryAttributeOptionLabel(option, locale) : value;
    filters.push({
      key: 'attr',
      value: encoded,
      label: `${attributeName}: ${displayValue.replace('..', '–')}`,
    });
  }
  return filters;
}

function clearRefinementsHref(params: SearchParams): string {
  const next = new URLSearchParams();
  const q = valuesFor(params.q)[0];
  const type = valuesFor(params.type)[0];
  if (q) next.set('q', q);
  if (type) next.set('type', type);
  return `/search?${next.toString()}`;
}

function valuesFor(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
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
