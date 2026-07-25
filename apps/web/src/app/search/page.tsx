import type { Metadata } from 'next';
import Link from 'next/link';
import type { Category, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { Icon } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';

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
    'sort',
  ] as const) {
    if (params[key]) query.set(key, params[key]!);
  }

  const cityId = params.cityId ?? city?.id;
  if (cityId) query.set('cityId', cityId);

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

  return (
    <>
      <section className="search-page__hero">
        <div className="container">
          <span className="section-kicker">{city?.name ?? t('location.nearby')}</span>
          <h1>
            {params.q
              ? t('search.resultsFor', { count: result?.total ?? 0, query: params.q })
              : t('search.placeholder')}
          </h1>

          <form className="search-page__query" action="/search" method="get" role="search">
            <Icon name="search" width="21" height="21" />
            <label htmlFor="results-search" className="sr-only">
              {t('search.submit')}
            </label>
            <input
              id="results-search"
              name="q"
              type="search"
              defaultValue={params.q ?? ''}
              placeholder={t('search.placeholder')}
              autoFocus={!params.q}
            />
            <button type="submit">
              {t('search.submit')} <Icon name="arrow" />
            </button>
          </form>

          <nav className="search-type-tabs" aria-label="Listing type">
            {[
              ['', 'Everything'],
              ['PRODUCT', 'For sale'],
              ['JOB', 'Jobs'],
              ['OFFER', 'Offers'],
              ['SERVICE', 'Services'],
              ['RENTAL', 'Rentals'],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={buildFilterHref(params, 'type', value)}
                className={params.type === value || (!params.type && !value) ? 'is-active' : ''}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <div className="container">
        <div className="results-layout">
          <aside className="search-filters">
            <form className="panel" action="/search" method="get">
              <div className="search-filters__head">
                <h2>{t('search.filters')}</h2>
                <Link href="/search">{t('search.clearFilters')}</Link>
              </div>

              {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
              {params.type ? <input type="hidden" name="type" value={params.type} /> : null}

              <div className="field">
                <label htmlFor="categoryId">{t('search.filter.category')}</label>
                <select id="categoryId" name="categoryId" defaultValue={params.categoryId ?? ''}>
                  <option value="">—</option>
                  {(categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="priceMin">{t('search.filter.price')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="priceMin"
                    name="priceMin"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder={t('search.filter.minPrice')}
                    defaultValue={params.priceMin ?? ''}
                  />
                  <input
                    name="priceMax"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder={t('search.filter.maxPrice')}
                    defaultValue={params.priceMax ?? ''}
                    aria-label={t('search.filter.maxPrice')}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="radiusKm">{t('search.filter.distance')}</label>
                <select id="radiusKm" name="radiusKm" defaultValue={params.radiusKm ?? ''}>
                  <option value="">{t('location.entireCity')}</option>
                  {[1, 3, 5, 10, 25, 50].map((km) => (
                    <option key={km} value={km}>
                      {t('location.within', { distance: km })}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="sort">{t('search.sort.label')}</label>
                <select id="sort" name="sort" defaultValue={params.sort ?? 'relevance'}>
                  <option value="relevance">{t('search.sort.relevance')}</option>
                  <option value="newest">{t('search.sort.newest')}</option>
                  <option value="price_asc">{t('search.sort.priceAsc')}</option>
                  <option value="price_desc">{t('search.sort.priceDesc')}</option>
                  <option value="popular">{t('search.sort.popular')}</option>
                  <option value="distance">{t('search.sort.distance')}</option>
                </select>
              </div>

              <button type="submit" className="btn btn--primary btn--block">
                Show {result?.total ?? 0} results
              </button>
            </form>
          </aside>

          <div className="search-results">
            <div className="search-results__toolbar">
              <div>
                <strong>{result?.total ?? 0} local matches</strong>
                <span>
                  {city?.name ? `Around ${city.name}` : 'Across available locations'}
                  {result?.usedSearchIndex ? ' · Best match' : ' · Latest first'}
                </span>
              </div>
              <span className="search-results__promise">
                <Icon name="shield" /> Safer local discovery
              </span>
            </div>

            {!result || result.items.length === 0 ? (
              <div className="empty-state">
                <img
                  className="empty-state__art"
                  src="/illustrations/empty-neighbourhood.webp"
                  alt=""
                  width="280"
                  height="230"
                />
                <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>{t('search.noResults')}</p>
                <p>{t('search.noResultsHint')}</p>
              </div>
            ) : (
              <>
                <div className="card-grid">
                  {result.items.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} t={t} />
                  ))}
                </div>

                {totalPages > 1 ? (
                  <nav
                    style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 32 }}
                    aria-label="Pagination"
                  >
                    {page > 1 ? (
                      <Link className="btn btn--outline" href={buildPageHref(params, page - 1)}>
                        ← {t('common.back')}
                      </Link>
                    ) : null}
                    <span style={{ color: 'var(--locz-text-muted)', fontSize: '0.875rem' }}>
                      {page} / {totalPages}
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
