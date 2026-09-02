import Image from 'next/image';
import Link from 'next/link';
import type { ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { Icon } from '@/components/icons';
import { getTranslator, getMessageGroup } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { premiumCategoryArtwork, premiumDiscoveryArtwork } from '@/lib/premium-icon-catalog';
import { NearbyBusinesses } from './search/nearby-businesses';
import { loadNearbyBusinesses } from './search/businesses-actions';
import { RADIUS_OPTIONS_KM, getLocale, getSelectedCity, getSelectedRadius } from '@/lib/session';
import { relativeTime } from '@/lib/relative-time';
import { RadiusSelector } from '@/components/radius-selector';
import { DiscoveryMotionLink } from '@/components/discovery-motion-link';
import { AdSlot } from '@/components/ad-slot';
import { PUBLIC_SERVICE_SLUGS, publicServiceLabel } from '@/lib/public-services';

interface LocalWeather {
  tempC: number;
  condition: string;
  description: string;
  icon: string;
  place: string | null;
}

interface NewsHeadline {
  slug: string;
  title: string;
  category: string;
  ring: 'local' | 'city' | 'district' | 'state' | 'national';
  imageUrl: string | null;
  imageCredit: string | null;
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

  const feed = await apiSafe<Feed>(`/feed?${query.toString()}`, { auth: true });
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
      const daMissing = typeof da !== 'number';
      const dbMissing = typeof db !== 'number';
      if (daMissing && dbMissing) return 0;
      if (daMissing) return 1;
      if (dbMissing) return -1;
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
  const homeBusinessesPromise =
    city?.latitude !== undefined && city?.longitude !== undefined
      ? // With a real GPS fix, measure distance from the caller's coordinates + a radius.
        // Do NOT also pass the pincode: the API would then switch the distance origin to the
        // pincode's business centroid (correct for an explicit pincode search, but here it can
        // sit kilometres from the user and inflate every "nearby" distance).
        loadNearbyBusinesses({
          latitude: city.latitude,
          longitude: city.longitude,
          radiusKm,
          page: 1,
        })
      : city?.pincode
        ? loadNearbyBusinesses({ pincode: city.pincode, page: 1 })
        : feed?.cityId
          ? // No stated location: fall back to the feed's resolved city so a first-time
            // visitor still sees nearby businesses (by city, without a distance).
            loadNearbyBusinesses({ cityId: feed.cityId, page: 1 })
          : Promise.resolve({ items: [], total: 0, page: 1, hasNextPage: false });

  // Scope live discovery counts to the visitor's selected city or pincode.
  const countScope = new URLSearchParams();
  const countCityId = city?.id ?? feed?.cityId;
  if (countCityId) countScope.set('cityId', countCityId);
  if (city?.pincode) countScope.set('pincode', city.pincode);
  // "Local Now" weather (met.no, key-less). getSelectedCity() is null until a visitor explicitly
  // picks a location, so keying the fetch on `city` left weather blank for almost everyone. Fall
  // back to the default launched market (Hyderabad) so the strip always shows real weather; an
  // explicit selection still wins.
  const wxLat = city?.latitude ?? 17.385;
  const wxLon = city?.longitude ?? 78.4867;
  const weatherPromise = apiSafe<{ weather: LocalWeather | null }>(
    `/local-now/weather?latitude=${wxLat}&longitude=${wxLon}`,
    { revalidate: 900 },
  );

  // "Around you" — how many known places sit in each discovery area, rolled up from the POIs we
  // already hold. This is the cold-start payoff: even before anyone posts, a new area reads as
  // alive ("1,240 food · 380 health · 920 services nearby").
  const areaSummaryPromise = countCityId
    ? apiSafe<{ areas: Array<{ area: string; count: number }> }>(
        `/local-now/area-summary?${countScope.toString()}`,
      )
    : Promise.resolve({ areas: [] });

  // "Popular in {city}" — the biggest business categories for the visitor's city, each linking to
  // its city × category hub page. This is the cold-start payoff surfaced on Home: the millions of
  // imported businesses become browsable the moment someone lands, and the links thread Home into
  // the hub pages (the indexable "{category} in {area}" surfaces). Falls back to the default
  // launched city so it is never empty for a first-time, location-less visitor.
  const homeCityPromise = city
    ? Promise.resolve(city)
    : apiSafe<Array<{ id: string; name: string; slug: string; tier: 1 | 2 | 3 }>>(
        '/locations/cities?launchedOnly=true&limit=1',
        { revalidate: 3600 },
      ).then((cities) => cities?.[0] ?? null);
  const [homeBusinesses, weatherResponse, areaSummaryResponse, homeCity] = await Promise.all([
    homeBusinessesPromise,
    weatherPromise,
    areaSummaryPromise,
    homeCityPromise,
  ]);
  const weather = weatherResponse?.weather ?? null;
  const areaSummary = areaSummaryResponse ?? { areas: [] };
  const homeCityRecord =
    homeCity?.slug && homeCity.tier === undefined
      ? await apiSafe<{ tier: 1 | 2 | 3 }>(
          `/locations/cities/${encodeURIComponent(homeCity.slug)}`,
          { revalidate: 86400 },
        )
      : null;
  const hasCityGuide = Boolean(
    homeCity?.slug &&
    ((homeCity.tier ?? homeCityRecord?.tier) === 1 ||
      (homeCity.tier ?? homeCityRecord?.tier) === 2),
  );
  // A tier-1/2 city has a hero image — theme the home hero background to the detected city.
  const cityHero =
    hasCityGuide && homeCity?.slug
      ? await apiSafe<{ heroImageUrl: string | null }>(
          `/locations/cities/${encodeURIComponent(homeCity.slug)}/hero`,
          { revalidate: 86400 },
        )
      : null;
  const cityHeroImage = cityHero?.heroImageUrl ?? null;
  const [bizCategories, cityCatCounts] = await Promise.all([
    apiSafe<Array<{ id: string; slug: string; name: string }>>('/businesses/categories', {
      revalidate: 86400,
    }),
    homeCity?.id
      ? apiSafe<Array<{ categoryId: string; count: number }>>(
          `/businesses/category-counts?cityId=${homeCity.id}`,
          { revalidate: 3600 },
        )
      : Promise.resolve([]),
  ]);
  const catCountById = new Map((cityCatCounts ?? []).map((c) => [c.categoryId, c.count]));
  const popularCategories = (bizCategories ?? [])
    .map((c) => ({ ...c, count: catCountById.get(c.id) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const categoryBySlug = new Map(
    (bizCategories ?? []).map((category) => [category.slug, category]),
  );
  const publicServiceCategories = PUBLIC_SERVICE_SLUGS.map((slug) => {
    const category = categoryBySlug.get(slug);
    return {
      slug,
      count: category ? (catCountById.get(category.id) ?? 0) : 0,
      label: publicServiceLabel(t, slug),
    };
  });
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
    'public-services',
  ];
  const areaCountByKey = new Map(areaSummary.areas.map(({ area, count }) => [area, count]));
  const heroAreas = primaryAreas.map((area) => ({ area, count: areaCountByKey.get(area) ?? 0 }));

  // "Local Now" news — live local headlines for the area, pulled on demand and cached server-side
  // (never stored). Display-only: headline + publisher + a link back to the original.
  // Our own regenerated news (news_stories), nearest-first for the reader's area — not raw Google
  // News. Links go to the LocZ article, never the source.
  // Pull a wider recent pool (cached). Keep the order supplied by the API: randomising a Server
  // Component with Math.random() produces different HTML when React replays the render and can
  // turn a harmless news rail into a full-page hydration mismatch.
  const newsQuery = new URLSearchParams({ limit: '20', lang: locale });
  if (city?.latitude && city?.longitude) {
    newsQuery.set('latitude', String(city.latitude));
    newsQuery.set('longitude', String(city.longitude));
  }
  // "Local Now" alerts — official NDMA SACHET public-safety warnings naming the area. Verbatim,
  // display-only, hidden when there is nothing.
  const alertQuery = new URLSearchParams({ q: feedCity });
  if (countCityId) alertQuery.set('cityId', countCityId);

  // "Local Now" jobs — live local openings (Adzuna), pulled on demand, cached, never stored.
  // Empty (section hidden) when the Adzuna credentials are not configured.
  const [newsResponse, alertsResponse, jobsResponse] = await Promise.all([
    apiSafe<{ cards: NewsHeadline[] }>(`/news/stories?${newsQuery.toString()}`, {
      revalidate: 120,
    }),
    feedCity
      ? apiSafe<{ alerts: LocalAlert[] }>(`/local-now/alerts?${alertQuery.toString()}`)
      : Promise.resolve(null),
    feedCity
      ? apiSafe<{ jobs: JobPosting[] }>(`/local-now/jobs?q=${encodeURIComponent(feedCity)}`)
      : Promise.resolve(null),
  ]);
  const newsHeadlines = newsResponse?.cards ?? [];
  const alerts = alertsResponse?.alerts ?? [];
  const jobs = jobsResponse?.jobs ?? [];

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
    'public-services': t('home.heroBrowse'),
  };

  return (
    <>
      <section
        className={`home-hero home-hero--discovery${cityHeroImage ? ' home-hero--city' : ''}`}
        id="home-top"
      >
        {cityHeroImage ? (
          <div className="home-hero__citybg" aria-hidden="true">
            <Image
              className="home-hero__city-image"
              src={cityHeroImage}
              alt=""
              fill
              sizes="100vw"
              quality={68}
              priority
              fetchPriority="high"
            />
          </div>
        ) : null}
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            {hasCityGuide && homeCity ? (
              <Link
                href={`/in/${homeCity.slug}`}
                className="home-discovery__location home-discovery__location--guide"
                aria-label={t('location.exploreCity', { city: homeCity.name })}
              >
                <Icon name="location" /> {feedCity}
                <small>{t('location.exploreCity', { city: homeCity.name })} →</small>
              </Link>
            ) : (
              <span className="home-discovery__location">
                <Icon name="location" /> {feedCity}
              </span>
            )}
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
                <DiscoveryMotionLink
                  key={area}
                  href={
                    area === 'public-services'
                      ? '/c/public-services'
                      : `/discover/${encodeURIComponent(area)}`
                  }
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
                </DiscoveryMotionLink>
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

      {homeCity && popularCategories.length > 0 ? (
        <section className="container home-popular" aria-labelledby="home-popular-title">
          <div className="home-popular__head">
            <div>
              <span className="section-kicker">{t('home.popularKicker')}</span>
              <h2 id="home-popular-title">{t('home.popularTitle', { city: homeCity.name })}</h2>
            </div>
            <span className="home-popular__summary" aria-label={areaLabels.businesses}>
              <Icon name="location" />
              <strong>
                {nf(popularCategories.reduce((total, category) => total + category.count, 0))}
              </strong>
              <span>{areaLabels.businesses}</span>
            </span>
          </div>
          <div className="home-popular__grid">
            {popularCategories.map((category) => (
              <Link
                key={category.slug}
                href={`/in/${homeCity.slug}/${category.slug}`}
                className="home-popular-card"
              >
                <span className="home-popular-card__art" aria-hidden="true">
                  <Image
                    src={premiumCategoryArtwork({ name: category.name })}
                    alt=""
                    width={64}
                    height={64}
                  />
                </span>
                <span className="home-popular-card__body">
                  <strong>{category.name}</strong>
                  <small>
                    {t('home.popularCount', {
                      count: category.count.toLocaleString(`${locale}-IN`),
                    })}
                  </small>
                </span>
                <span className="home-popular-card__arrow" aria-hidden="true">
                  <Icon name="arrow" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {homeCity ? (
        <section
          className="container home-public-services-compact"
          aria-labelledby="home-public-services-compact-title"
        >
          <Link href="/c/public-services" className="home-public-services-compact__directory">
            <span className="home-public-services-compact__icon" aria-hidden="true">
              <Image
                src="/icons/public-services/public-services.webp"
                alt=""
                width={48}
                height={48}
                sizes="48px"
              />
            </span>
            <span className="home-public-services-compact__copy">
              <span className="section-kicker">{t('home.publicServicesKicker')}</span>
              <h2 id="home-public-services-compact-title">
                {t('home.publicServicesTitle', { city: homeCity.name })}
              </h2>
            </span>
            <span className="home-public-services-compact__arrow" aria-hidden="true">
              <Icon name="arrow" />
            </span>
          </Link>
          <nav
            className="home-public-services-compact__links"
            aria-label={t('home.publicServicesTitle', { city: homeCity.name })}
          >
            {publicServiceCategories.map((category) => (
              <Link
                key={category.slug}
                href={`/c/${category.slug}`}
                className="home-public-services-compact__link"
              >
                <strong>{category.label}</strong>
                <small>
                  {t('home.publicServicesCount', {
                    count: category.count.toLocaleString(`${locale}-IN`),
                  })}
                </small>
              </Link>
            ))}
          </nav>
        </section>
      ) : null}

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
                <span className="local-alerts__signal">
                  <Icon name="alert" />
                  <h2 id="local-alerts-title">{t('home.alertsTitle')}</h2>
                </span>
                <span className="local-alerts__source">{'NDMA SACHET'}</span>
              </div>
              <ul className="local-alerts__list">
                {alerts.map((alert) => {
                  const when = relativeTime(alert.publishedAt, locale);
                  return (
                    <li key={alert.title}>
                      <span className="local-alerts__marker" aria-hidden="true" />
                      <span className="local-alerts__message">{alert.title}</span>
                      {when ? <time>{when}</time> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="home-content-shell">
          {newsHeadlines.length > 0 ? (
            <section className="local-news" aria-labelledby="local-news-title">
              <div className="local-news__head">
                <div>
                  <span className="section-kicker">
                    <span className="local-news__pulse" aria-hidden="true" />
                    {t('home.localNewsKicker')}
                  </span>
                  <h2 id="local-news-title">{t('home.localNewsTitle', { city: feedCity })}</h2>
                </div>
                <Link href="/news" className="local-city-panel__action">
                  {t('feed.seeAll')} <Icon name="arrow" />
                </Link>
              </div>
              <div className="local-news__feed">
                {newsHeadlines.slice(0, 4).map((item, index) => {
                  const when = relativeTime(item.publishedAt, locale);
                  if (index === 0 && item.imageUrl) {
                    return (
                      <Link key={item.slug} href={`/news/${item.slug}`} className="local-news-hero">
                        <div className="local-news-hero__img">
                          <Image
                            src={item.imageUrl}
                            alt=""
                            fill
                            sizes="(max-width: 760px) calc(100vw - 48px), 340px"
                            quality={64}
                          />
                        </div>
                        <div className="local-news-hero__body">
                          <div className="local-news-meta">
                            <span className="local-news-tag">{item.category || 'City News'}</span>
                            {when ? <span className="local-news-time">{when}</span> : null}
                          </div>
                          <strong className={locale === 'te' ? 'te' : undefined}>
                            {item.title}
                          </strong>
                        </div>
                      </Link>
                    );
                  }
                  return (
                    <Link key={item.slug} href={`/news/${item.slug}`} className="local-news-row">
                      <div className="local-news-row__body">
                        <div className="local-news-meta">
                          <span className="local-news-tag">{item.category || 'Local'}</span>
                          {when ? <span className="local-news-time">{when}</span> : null}
                        </div>
                        <strong className={locale === 'te' ? 'te' : undefined}>{item.title}</strong>
                      </div>
                      {item.imageUrl ? (
                        <div className="local-news-row__thumb">
                          <Image src={item.imageUrl} alt="" fill sizes="96px" quality={58} />
                        </div>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
              <Link href="/news" className="local-news__more-btn">
                <span>View all local stories</span> <Icon name="arrow" />
              </Link>
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
              <div className="empty-state empty-state--compact">
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

            <AdSlot
              placement="HOME_AFTER_LOCAL_NOW"
              contentScore={newsHeadlines.length + visibleFeedItems.length}
            />

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
                  initialTotal={homeBusinesses.total}
                  verifiedLabel={searchLabels.businessVerified}
                  claimLabel={searchLabels.businessClaim}
                  directionsLabel={searchLabels.directions}
                  viewProfileLabel={searchLabels.viewProfile}
                  listingsLabel={searchLabels.listingCount}
                  nearYou={searchLabels.nearYou}
                  loadingLabel={searchLabels.loadingMoreBusinesses}
                  showingLabel={searchLabels.showingBusinesses}
                  loadMoreLabel={searchLabels.loadMoreBusinesses}
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

            <AdSlot placement="HOME_AFTER_BUSINESSES" contentScore={homeBusinesses.items.length} />

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
