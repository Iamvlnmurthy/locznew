import Image from 'next/image';
import Link from 'next/link';
import type { Category, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { Icon } from '@/components/icons';
import { getTranslator, getMessageGroup } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { premiumCategoryArtwork, premiumDiscoveryArtwork } from '@/lib/premium-icon-catalog';
import { NearbyBusinesses } from './search/nearby-businesses';
import { loadNearbyBusinesses } from './search/businesses-actions';
import { RADIUS_OPTIONS_KM, getLocale, getSelectedCity, getSelectedRadius } from '@/lib/session';
import { RadiusSelector } from '@/components/radius-selector';

interface LocalWeather {
  tempC: number;
  condition: string;
  description: string;
  icon: string;
  place: string | null;
}

interface NewsHeadline {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
}

interface JobPosting {
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  postedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

interface LocalAlert {
  title: string;
  category: string | null;
  publishedAt: string | null;
}

/** Indian digit grouping — 1,15,109 not 115,109. Used for the hero tile counts. */
function nf(value: number): string {
  return value.toLocaleString('en-IN');
}

/** Indian annual salary in lakhs — "₹18L–25L", "₹18L+", or null when unknown. */
function formatSalary(min: number | null, max: number | null): string | null {
  const lakh = (value: number): string => {
    const l = value / 100000;
    return `₹${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)}L`;
  };
  if (min && max) return min === max ? lakh(min) : `${lakh(min)}–${lakh(max)}`;
  if (min) return `${lakh(min)}+`;
  if (max) return `${lakh(max)}`;
  return null;
}

/** Localised "2 hours ago" without any translation keys — Intl handles the language. */
function relativeTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = then - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

interface FeedSection {
  key: string;
  title: string;
  seeAllHref?: string;
  items: ListingSummary[];
}

interface Feed {
  cityId: string;
  cityName: string;
  radiusWidened: boolean;
  sections: FeedSection[];
}

// The feed is personalised for signed-in users and location-dependent for everyone,
// so it is rendered per request rather than cached.
export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; sort?: string }>;
}) {
  const { area: selectedArea, sort = 'nearest' } = await searchParams;
  const [locale, city, radiusKm] = await Promise.all([
    getLocale(),
    getSelectedCity(),
    getSelectedRadius(),
  ]);
  const t = getTranslator(locale);

  const query = new URLSearchParams({ limit: '12' });
  if (city?.id) query.set('cityId', city.id);
  // A visitor who stated a pincode gets the area around it, launched city or not.
  if (city?.pincode) query.set('pincode', city.pincode);
  if (city?.latitude && city?.longitude) {
    query.set('latitude', String(city.latitude));
    query.set('longitude', String(city.longitude));
    // Radius only bites with coordinates; the API ignores it otherwise.
    query.set('radiusKm', String(radiusKm));
  }

  const [feed, categories] = await Promise.all([
    apiSafe<Feed>(`/feed?${query.toString()}`, { auth: true }),
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
  ]);

  const topCategories = (categories ?? []).slice(0, 12);
  const feedCity = feed?.cityName ?? city?.name ?? t('home.yourCity');

  // One merged, proximity-sorted "Around You Now" column instead of horizontal rails — the
  // same vertical feed the mobile app uses, so results scroll like a normal feed, not sideways.
  const feedItems: ListingSummary[] = (() => {
    if (!feed) return [];
    const seen = new Set<string>();
    const items: ListingSummary[] = [];
    for (const section of feed.sections) {
      for (const item of section.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
    }
    items.sort((a, b) => {
      const da = a.distanceMeters;
      const db = b.distanceMeters;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
    return items;
  })();
  const areaTypes: Readonly<Record<string, ReadonlySet<ListingSummary['type']>>> = {
    deals: new Set(['OFFER']),
    jobs: new Set(['JOB']),
    rentals: new Set(['RENTAL']),
    services: new Set(['SERVICE']),
    shopping: new Set(['PRODUCT', 'CLASSIFIED']),
    marketplace: new Set(['PRODUCT', 'CLASSIFIED']),
    events: new Set(['EVENT']),
    'happening-nearby': new Set(['EVENT']),
    'local-requests': new Set(['BUYER_REQUIREMENT']),
    businesses: new Set(['BUSINESS_LISTING']),
    property: new Set(['RENTAL']),
  };
  const selectedTypes = selectedArea ? areaTypes[selectedArea] : undefined;
  const visibleFeedItems = selectedTypes
    ? feedItems.filter((item) => selectedTypes.has(item.type))
    : [...feedItems];
  if (sort === 'latest') {
    visibleFeedItems.sort(
      (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime(),
    );
  }

  // Businesses near you — the cold-start payoff: even with no listings yet, the imported
  // directory (millions of geocoded businesses) gives a new user real nearby places on Home.
  const searchLabels = getMessageGroup(locale, 'searchUi');
  const homeBusinesses =
    city?.latitude !== undefined && city?.longitude !== undefined
      ? await loadNearbyBusinesses({
          latitude: city.latitude,
          longitude: city.longitude,
          radiusKm,
          pincode: city.pincode,
          page: 1,
        })
      : city?.pincode
        ? await loadNearbyBusinesses({ pincode: city.pincode, page: 1 })
        : feed?.cityId
          ? // No stated location: fall back to the feed's resolved city so a first-time
            // visitor still sees nearby businesses (by city, without a distance).
            await loadNearbyBusinesses({ cityId: feed.cityId, page: 1 })
          : { items: [], total: 0, page: 1, hasNextPage: false };

  // Live nearby business counts per category → "Food · 12,400" on the tiles, so it's obvious
  // which local areas are actually populated.
  const countScope = new URLSearchParams();
  const countCityId = city?.id ?? feed?.cityId;
  if (countCityId) countScope.set('cityId', countCityId);
  if (city?.pincode) countScope.set('pincode', city.pincode);
  const categoryCounts = countCityId
    ? await apiSafe<Array<{ categoryId: string; count: number }>>(
        `/businesses/category-counts?${countScope.toString()}`,
      )
    : [];
  const countByCategory = new Map((categoryCounts ?? []).map((c) => [c.categoryId, c.count]));

  // "Local Now" weather — display-only, and null unless OPENWEATHER_API_KEY is configured.
  const weather =
    city?.latitude !== undefined && city?.longitude !== undefined
      ? ((
          await apiSafe<{ weather: LocalWeather | null }>(
            `/local-now/weather?latitude=${city.latitude}&longitude=${city.longitude}`,
          )
        )?.weather ?? null)
      : null;

  // "Around you" — how many known places sit in each discovery area, rolled up from the POIs we
  // already hold. This is the cold-start payoff: even before anyone posts, a new area reads as
  // alive ("1,240 food · 380 health · 920 services nearby").
  const areaSummary = countCityId
    ? ((await apiSafe<{ areas: Array<{ area: string; count: number }> }>(
        `/local-now/area-summary?${countScope.toString()}`,
      )) ?? { areas: [] })
    : { areas: [] };
  const areaLabels = getMessageGroup(locale, 'discoveryAreas');
  const primaryAreas = [
    'local-now',
    'businesses',
    'jobs',
    'news',
    'alerts',
    'deals',
    'services',
    'marketplace',
  ];
  const areaCountByKey = new Map(areaSummary.areas.map(({ area, count }) => [area, count]));
  const heroAreas = primaryAreas.map((area) => ({ area, count: areaCountByKey.get(area) ?? 0 }));

  // "Local Now" news — live local headlines for the area, pulled on demand and cached server-side
  // (never stored). Display-only: headline + publisher + a link back to the original.
  const newsHeadlines = feedCity
    ? ((
        await apiSafe<{ headlines: NewsHeadline[] }>(
          `/local-now/news?q=${encodeURIComponent(feedCity)}`,
        )
      )?.headlines ?? [])
    : [];

  // "Local Now" alerts — official NDMA SACHET public-safety warnings naming the area. Verbatim,
  // display-only, hidden when there is nothing.
  const alertQuery = new URLSearchParams({ q: feedCity });
  if (countCityId) alertQuery.set('cityId', countCityId);
  const alerts = feedCity
    ? ((await apiSafe<{ alerts: LocalAlert[] }>(`/local-now/alerts?${alertQuery.toString()}`))
        ?.alerts ?? [])
    : [];

  // "Local Now" jobs — live local openings (Adzuna), pulled on demand, cached, never stored.
  // Empty (section hidden) when the Adzuna credentials are not configured.
  const jobs = feedCity
    ? ((await apiSafe<{ jobs: JobPosting[] }>(`/local-now/jobs?q=${encodeURIComponent(feedCity)}`))
        ?.jobs ?? [])
    : [];

  const heroMetrics: Record<string, string> = {
    'local-now': newsHeadlines.length
      ? t('home.heroUpdates', { count: newsHeadlines.length })
      : t('home.heroUpdatedNow'),
    businesses: homeBusinesses.total
      ? t('home.heroNearby', { count: nf(homeBusinesses.total) })
      : t('home.heroBrowse'),
    jobs: jobs.length ? t('home.heroOpenings', { count: nf(jobs.length) }) : t('home.heroExplore'),
    news: newsHeadlines.length
      ? t('home.heroUpdates', { count: nf(newsHeadlines.length) })
      : t('home.heroExplore'),
    alerts: alerts.length
      ? t('home.heroActive', { count: nf(alerts.length) })
      : t('home.heroNoAlerts'),
    deals:
      (areaCountByKey.get('deals') ?? 0)
        ? t('home.heroNearby', { count: nf(areaCountByKey.get('deals') ?? 0) })
        : t('home.heroExplore'),
    services:
      (areaCountByKey.get('services') ?? 0)
        ? t('home.heroNearby', { count: nf(areaCountByKey.get('services') ?? 0) })
        : t('home.heroExplore'),
    marketplace:
      (areaCountByKey.get('marketplace') ?? 0)
        ? t('home.heroNearby', { count: nf(areaCountByKey.get('marketplace') ?? 0) })
        : t('home.heroExplore'),
  };

  return (
    <>
      <section className="home-hero home-hero--discovery" id="home-top">
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            <span className="home-hero__eyebrow">{t('home.heroEyebrow')}</span>
            <span className="home-discovery__location">
              <Icon name="location" /> {feedCity}
            </span>
            <h1>{t('home.exploreTitle', { city: feedCity })}</h1>
            <p className="home-hero__subtitle">{t('home.heroSubtitle', { city: feedCity })}</p>
            <RadiusSelector
              options={[...RADIUS_OPTIONS_KM]}
              selected={radiusKm}
              label={t('home.within')}
              kmLabel={t('common.km')}
            />

            <form className="hero-search" action="/search" method="get" role="search">
              <Icon name="search" width="21" height="21" />
              <label htmlFor="hero-search" className="sr-only">
                {t('search.submit')}
              </label>
              <input
                id="hero-search"
                name="q"
                type="search"
                placeholder={t('home.searchPlaceholder', { city: feedCity })}
                autoComplete="off"
              />
              <button type="submit">
                {t('search.submit')} <Icon name="arrow" width="17" height="17" />
              </button>
            </form>
            <nav className="home-hero__quick-links" aria-label={t('home.popularAria')}>
              <span>{t('home.popularNow')}</span>
              <Link href="/search?q=iPhone">iPhone</Link>
              <Link href="/discover/jobs">{t('home.popularJobs')}</Link>
              <Link href="/search?q=rooms">{t('home.popularRooms')}</Link>
              <Link href="/search?q=electrician">{t('home.popularElectrician')}</Link>
            </nav>
          </div>

          <div
            className="home-discovery home-discovery--bento"
            aria-labelledby="home-discovery-title"
          >
            <div className="home-discovery__head">
              <div>
                <span className="section-kicker">{t('home.exploreKicker')}</span>
                <h2 id="home-discovery-title">{t('home.explore')}</h2>
              </div>
              <Link href="/search">
                {t('feed.seeAll')} <Icon name="arrow" />
              </Link>
            </div>
            <div className="home-discovery__grid home-discovery__grid--bento">
              {heroAreas.map(({ area, count }) => (
                <Link
                  key={area}
                  href={`/discover/${encodeURIComponent(area)}`}
                  className={`home-discovery-card home-discovery-card--${area}`}
                >
                  <span className="home-discovery-card__art" aria-hidden="true">
                    <Image
                      src={premiumDiscoveryArtwork(area)}
                      alt=""
                      width={72}
                      height={72}
                      sizes="72px"
                    />
                  </span>
                  <span className="home-discovery-card__body">
                    <strong>{areaLabels[area] ?? area}</strong>
                    <small>{heroMetrics[area] ?? count.toLocaleString('en-IN')}</small>
                  </span>
                  <Icon name="arrow" className="home-discovery-card__arrow" />
                </Link>
              ))}
            </div>
            <div className="home-discovery__context" aria-label={t('home.heroContext')}>
              <span>
                <i aria-hidden="true">{weather ? weatherEmoji(weather.condition) : '◌'}</i>
                <b>{weather ? `${weather.tempC}°C` : '—'}</b>
                <small>{weather?.description ?? t('home.heroWeather')}</small>
              </span>
              <span>
                <Icon name="alert" />
                <b>{alerts.length}</b>
                <small>{t('home.alertsTitle')}</small>
              </span>
              <span>
                <Icon name="location" />
                <b>{homeBusinesses.total.toLocaleString('en-IN')}</b>
                <small>{areaLabels.businesses}</small>
              </span>
              <span>
                <Icon name="sparkles" />
                <b>{t('home.heroLive')}</b>
                <small>{t('home.heroUpdatedNow')}</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="container home-desktop-content">
        <div className="home-status-rail">
          {weather ? (
            <div className="local-now" role="status">
              <span className="local-now__icon" aria-hidden="true">
                {weatherEmoji(weather.condition)}
              </span>
              <span className="local-now__body">
                <span className="local-now__eyebrow">{t('home.heroWeather')}</span>
                <span className="local-now__reading">
                  <strong>{weather.tempC}°C</strong>
                  <span className="local-now__desc">{weather.description}</span>
                </span>
              </span>
              {/* Required MET Norway attribution — a brand name, identical in every language. */}
              <span className="local-now__attribution">{'MET Norway'}</span>
            </div>
          ) : null}

          {alerts.length > 0 ? (
            <section className="local-alerts" aria-labelledby="local-alerts-title" role="alert">
              <div className="local-alerts__head">
                <Icon name="alert" />
                <h2 id="local-alerts-title">{t('home.alertsTitle')}</h2>
              </div>
              <ul className="local-alerts__list">
                {alerts.map((alert) => {
                  const when = relativeTime(alert.publishedAt, locale);
                  return (
                    <li key={alert.title}>
                      <span>{alert.title}</span>
                      {when ? <time>{when}</time> : null}
                    </li>
                  );
                })}
              </ul>
              {/* NDMA SACHET is an official source name — identical in every language. */}
              <p className="local-alerts__attribution">{'NDMA SACHET'}</p>
            </section>
          ) : null}
        </div>

        <div className="home-content-shell">
          {newsHeadlines.length > 0 ? (
            <section className="local-news" aria-labelledby="local-news-title">
              <div className="local-news__head">
                <div>
                  <span className="section-kicker">{t('home.localNewsKicker')}</span>
                  <h2 id="local-news-title">{t('home.localNewsTitle', { city: feedCity })}</h2>
                </div>
                <Link href="/discover/local-now" className="local-city-panel__action">
                  {t('feed.seeAll')} <Icon name="arrow" />
                </Link>
              </div>
              <ul className="local-news__list">
                {newsHeadlines.slice(0, 5).map((item) => {
                  const when = relativeTime(item.publishedAt, locale);
                  return (
                    <li key={item.url}>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        <span className="local-news__dot" aria-hidden="true" />
                        <span className="local-news__body">
                          <strong>{item.title}</strong>
                          <span className="local-news__meta">
                            {item.source}
                            {when ? ` · ${when}` : ''}
                          </span>
                        </span>
                        <Icon name="arrow" />
                      </a>
                    </li>
                  );
                })}
              </ul>
              {/* Google News is a brand name — identical in every language. */}
              <p className="local-news__attribution">{'Google News'}</p>
            </section>
          ) : null}

          <main className="home-main-column">
            {selectedArea || (feed && feed.sections.length > 0) ? (
              <section className="home-feed-toolbar" id="local-feed">
                <div>
                  {selectedArea ? (
                    <Link href="/#home-top" className="home-feed-toolbar__back">
                      <Icon name="arrow" /> {t('home.explore')}
                    </Link>
                  ) : (
                    <span className="section-kicker">{t('home.feedKicker')}</span>
                  )}
                  <h2>
                    {selectedArea
                      ? (areaLabels[selectedArea] ?? selectedArea)
                      : t('home.feedTitle', { city: feed?.cityName ?? feedCity })}
                  </h2>
                </div>
                <div className="home-feed-toolbar__filters" aria-label={searchLabels.filters}>
                  <Link
                    href={`/?${selectedArea ? `area=${encodeURIComponent(selectedArea)}&` : ''}sort=nearest#local-feed`}
                    className={sort !== 'latest' ? 'is-active' : ''}
                  >
                    {searchLabels.nearestFirst}
                  </Link>
                  <Link
                    href={`/?${selectedArea ? `area=${encodeURIComponent(selectedArea)}&` : ''}sort=latest#local-feed`}
                    className={sort === 'latest' ? 'is-active' : ''}
                  >
                    {searchLabels.latestFirst}
                  </Link>
                  <Link href="/search">
                    <Icon name="sliders" /> {searchLabels.filters}
                  </Link>
                </div>
              </section>
            ) : null}

            {!feed || feed.sections.length === 0 ? (
              <div className="empty-state">
                <img
                  className="empty-state__art"
                  src="/illustrations/empty-neighbourhood.webp"
                  alt=""
                  width="280"
                  height="230"
                />
                <h1 className="page-title">{t('brand.tagline')}</h1>
                <p>{t('feed.empty')}</p>
                <Link href="/post" className="btn btn--primary" style={{ marginTop: 16 }}>
                  <Icon name="plus" width="18" height="18" /> {t('nav.post')}
                </Link>
              </div>
            ) : (
              <>
                <div className="card-grid home-feed-grid">
                  {visibleFeedItems.slice(0, 6).map((listing) => (
                    <ListingCard key={listing.id} listing={listing} t={t} />
                  ))}
                </div>

                <aside className="home-post-invitation">
                  <span className="home-post-invitation__icon">
                    <Icon name="plus" />
                  </span>
                  <div>
                    <span className="section-kicker">{t('home.postKicker')}</span>
                    <h2>{t('home.postTitle')}</h2>
                    <p>{t('home.postBody')}</p>
                  </div>
                  <Link href="/post" className="btn btn--primary">
                    {t('home.postFree')} <Icon name="arrow" />
                  </Link>
                </aside>
              </>
            )}

            {homeBusinesses.items.length > 0 ? (
              <section className="search-businesses" aria-labelledby="home-businesses-title">
                <div className="search-businesses__head">
                  <div>
                    <span className="section-kicker">{searchLabels.businessesKicker}</span>
                    <h2 id="home-businesses-title">{searchLabels.businessesTitle}</h2>
                  </div>
                  <Link href="/business">
                    {t('feed.seeAll')} <Icon name="arrow" />
                  </Link>
                </div>
                <NearbyBusinesses
                  pincode={city?.pincode}
                  cityId={city?.id ?? feed?.cityId}
                  latitude={city?.latitude}
                  longitude={city?.longitude}
                  radiusKm={radiusKm}
                  initial={homeBusinesses.items.slice(0, 9)}
                  initialHasMore={false}
                  verifiedLabel={searchLabels.businessVerified}
                  claimLabel={searchLabels.businessClaim}
                  directionsLabel={searchLabels.directions}
                  viewProfileLabel={searchLabels.viewProfile}
                  listingsLabel={searchLabels.listingCount}
                  nearYou={searchLabels.nearYou}
                  loadingLabel={searchLabels.loadingMoreBusinesses}
                  kmLabel={t('common.km')}
                  withinKm={searchLabels.withinKm}
                  areaOptions={areaSummary.areas.map(({ area }) => ({
                    key: area,
                    label: areaLabels[area] ?? area,
                  }))}
                  allCategoriesLabel={searchLabels.allCategories}
                  verifiedOnlyLabel={searchLabels.verifiedOnly}
                  emptyLabel={searchLabels.noBusinessesMatch}
                />
              </section>
            ) : null}

            {/* Discovery first: the marketing intents and the full category grid sit BELOW the
            live "around you" feed, so a returning user sees real nearby inventory first. */}
            {topCategories.length > 0 ? (
              <section className="category-section">
                <div className="section__head">
                  <div>
                    <span className="section-kicker">{t('home.explore')}</span>
                    <h2>{t('feed.browseCategories')}</h2>
                  </div>
                  <Link href="/search" className="section-link">
                    {t('feed.seeAll')} <Icon name="arrow" />
                  </Link>
                </div>
                <nav className="category-strip" aria-label={t('feed.browseCategories')}>
                  {topCategories.map((category, index) => (
                    <Link
                      key={category.id}
                      href={`/c/${category.slug}`}
                      className={`category-chip category-chip--${(index % 6) + 1}`}
                    >
                      <span className="category-chip__icon" aria-hidden="true">
                        <Image
                          src={premiumCategoryArtwork({ slug: category.slug, name: category.name })}
                          alt=""
                          width={64}
                          height={64}
                        />
                      </span>
                      <span>
                        {localisedCategoryName(category, locale)}
                        {countByCategory.get(category.id) ? (
                          <small className="category-chip__count">
                            {countByCategory.get(category.id)!.toLocaleString()}{' '}
                            {t('home.countNearby')}
                          </small>
                        ) : null}
                      </span>
                      <i aria-hidden="true">→</i>
                    </Link>
                  ))}
                </nav>
              </section>
            ) : null}

            <section className="home-intents" aria-labelledby="home-intents-title">
              <div className="home-intents__intro">
                <span className="section-kicker">{t('home.intentsKicker')}</span>
                <h2 id="home-intents-title">{t('home.intentsTitle')}</h2>
              </div>
              <div className="home-intents__grid">
                {[
                  {
                    href: '/search?type=PRODUCT',
                    icon: 'tag',
                    title: t('home.intentFindTitle'),
                    text: t('home.intentFindBody'),
                  },
                  {
                    href: '/post',
                    icon: 'plus',
                    title: t('home.intentSellTitle'),
                    text: t('home.intentSellBody'),
                  },
                  {
                    href: '/search?type=JOB',
                    icon: 'briefcase',
                    title: t('home.intentWorkTitle'),
                    text: t('home.intentWorkBody'),
                  },
                  {
                    href: '/business',
                    icon: 'tools',
                    title: t('home.intentHelpTitle'),
                    text: t('home.intentHelpBody'),
                  },
                ].map((intent) => (
                  <Link key={intent.title} href={intent.href} className="home-intent">
                    <span>
                      <Icon name={intent.icon} />
                    </span>
                    <div>
                      <strong>{intent.title}</strong>
                      <p>{intent.text}</p>
                    </div>
                    <Icon name="arrow" />
                  </Link>
                ))}
              </div>
            </section>
          </main>

          {jobs.length > 0 ? (
            <section className="local-jobs" aria-labelledby="local-jobs-title">
              <div className="local-jobs__head">
                <div>
                  <span className="section-kicker">{t('home.jobsKicker')}</span>
                  <h2 id="local-jobs-title">{t('home.jobsTitle', { city: feedCity })}</h2>
                </div>
                <Link href="/discover/jobs" className="local-city-panel__action">
                  {t('feed.seeAll')} <Icon name="arrow" />
                </Link>
              </div>
              <div className="local-jobs__list">
                {jobs.slice(0, 5).map((job) => {
                  const salary = formatSalary(job.salaryMin, job.salaryMax);
                  const when = relativeTime(job.postedAt, locale);
                  return (
                    <a
                      key={job.url}
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="local-jobs__card"
                    >
                      <span className="local-jobs__icon" aria-hidden="true">
                        <Icon name="briefcase" />
                      </span>
                      <span className="local-jobs__body">
                        <strong>{job.title}</strong>
                        <span className="local-jobs__meta">
                          {[job.company, job.location].filter(Boolean).join(' · ')}
                        </span>
                        {salary || when ? (
                          <span className="local-jobs__tags">
                            {salary ? <span className="local-jobs__salary">{salary}</span> : null}
                            {when ? <span>{when}</span> : null}
                          </span>
                        ) : null}
                      </span>
                      <Icon name="arrow" />
                    </a>
                  );
                })}
              </div>
              {/* Adzuna is a brand name — identical in every language. */}
              <p className="local-jobs__attribution">{'Adzuna'}</p>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** A small emoji for a met.no condition base code, so no external icon host is needed. */
function weatherEmoji(condition: string): string {
  if (condition.includes('thunder')) return '⛈️';
  if (condition.includes('snow') || condition.includes('sleet')) return '❄️';
  if (condition.includes('rain') || condition.includes('shower')) return '🌧️';
  if (condition.includes('fog')) return '🌫️';
  if (condition === 'cloudy') return '☁️';
  if (condition.includes('partlycloudy')) return '⛅';
  if (condition === 'fair') return '🌤️';
  if (condition.includes('clearsky')) return '☀️';
  return '🌡️';
}

function localisedCategoryName(category: Category, locale: string): string {
  if (locale === 'te' && category.nameTe) return category.nameTe;
  if (locale === 'hi' && category.nameHi) return category.nameHi;
  return category.name;
}
