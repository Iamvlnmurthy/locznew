import Link from 'next/link';
import type { Category, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { Icon, categoryImageName } from '@/components/icons';
import { getTranslator, getMessageGroup } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { NearbyBusinesses } from './search/nearby-businesses';
import { loadNearbyBusinesses } from './search/businesses-actions';
import {
  RADIUS_OPTIONS_KM,
  getCurrentUser,
  getLocale,
  getSelectedCity,
  getSelectedRadius,
} from '@/lib/session';
import { RadiusSelector } from '@/components/radius-selector';

interface LocalWeather {
  tempC: number;
  condition: string;
  description: string;
  icon: string;
  place: string | null;
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

// Discovery area → the SVG icon on its "Around you" chip. Keys match the API's area keys.
const AREA_ICON: Record<string, string> = {
  food: 'utensils',
  health: 'stethoscope',
  services: 'wrench',
  shopping: 'bag',
  mobility: 'car',
  home: 'homeCategory',
  jobs: 'briefcase',
  events: 'calendar',
  rentals: 'bed',
  deals: 'tag',
  businesses: 'store',
  play: 'heart',
  pets: 'heart',
};

// The feed is personalised for signed-in users and location-dependent for everyone,
// so it is rendered per request rather than cached.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [locale, city, user, radiusKm] = await Promise.all([
    getLocale(),
    getSelectedCity(),
    getCurrentUser(),
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
  const uniqueListings = feed
    ? new Set(feed.sections.flatMap((section) => section.items.map((item) => item.id))).size
    : 0;
  const firstName = user?.displayName.split(' ')[0];

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

  return (
    <>
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            <span className="eyebrow">
              {/* Generic, not name-injected: an all-caps first name like "Info" read as broken. */}
              <i /> {t('home.eyebrow')}
            </span>
            <h1>{t('home.title')}</h1>
            <p>{firstName ? t('home.personalSubtitle', { city: feedCity }) : t('home.subtitle')}</p>
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

            <div className="hero-popular" aria-label={t('home.popularAria')}>
              <span>{t('home.popularNow')}</span>
              <Link href="/search?q=iPhone">iPhone</Link>
              <Link href="/search?type=JOB">{t('home.popularJobs')}</Link>
              <Link href="/search?type=RENTAL">{t('home.popularRooms')}</Link>
              <Link href="/search?type=SERVICE&q=electrician">{t('home.popularElectrician')}</Link>
            </div>

            <div className="hero-trust" aria-label={t('home.trustLabel')}>
              <span>
                <Icon name="shield" /> {t('home.trustSafe')}
              </span>
              <span>
                <Icon name="plus" /> {t('home.trustFree')}
              </span>
              <span>
                <Icon name="location" /> {t('home.trustLocal')}
              </span>
            </div>
          </div>

          <div className="home-hero__scene" aria-hidden="true">
            <picture>
              <source
                media="(max-width: 900px)"
                srcSet="/illustrations/hero-neighbourhood-mobile.webp"
              />
              <img
                src="/illustrations/hero-neighbourhood.webp"
                alt=""
                width="1800"
                height="900"
                fetchPriority="high"
              />
            </picture>
          </div>
        </div>
      </section>

      <div className="container">
        {weather ? (
          <div className="local-now" role="status">
            <span className="local-now__icon" aria-hidden="true">
              {weatherEmoji(weather.condition)}
            </span>
            <strong>{weather.tempC}°C</strong>
            <span className="local-now__desc">{weather.description}</span>
            {/* Required MET Norway attribution — a brand name, identical in every language. */}
            <span className="local-now__attribution">{'MET Norway'}</span>
          </div>
        ) : null}

        {areaSummary.areas.length > 0 ? (
          <section className="area-summary" aria-labelledby="area-summary-title">
            <div className="area-summary__head">
              <span className="section-kicker">{t('home.exploreKicker')}</span>
              <h2 id="area-summary-title">{t('home.exploreTitle', { city: feedCity })}</h2>
            </div>
            <div className="area-summary__grid">
              {areaSummary.areas.map(({ area, count }) => (
                <Link
                  key={area}
                  href={`/search?${countScope.toString()}`}
                  className="area-chip"
                  data-area={area}
                >
                  <span className="area-chip__icon" aria-hidden="true">
                    <Icon name={AREA_ICON[area] ?? 'store'} />
                  </span>
                  <span className="area-chip__body">
                    <strong>{count.toLocaleString('en-IN')}</strong>
                    <span>{areaLabels[area] ?? area}</span>
                  </span>
                </Link>
              ))}
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
            <section className="home-feed-intro">
              <div>
                <span className="section-kicker">{t('home.feedKicker')}</span>
                <h2>{t('home.feedTitle', { city: feed.cityName })}</h2>
                <p>
                  {feed.radiusWidened
                    ? t('home.radiusWidened', { radius: radiusKm })
                    : t('home.feedBody')}
                </p>
              </div>
              <div className="home-feed-intro__pulse" aria-label={t('home.activityAria')}>
                <span>
                  <strong>{uniqueListings}</strong>
                  {t('home.freshFinds')}
                </span>
                <i aria-hidden="true" />
                <span>
                  <strong>{feed.sections.length}</strong>
                  {t('home.usefulCollections')}
                </span>
                <Link href="/location">
                  <Icon name="location" />
                  {t('home.changeArea')}
                </Link>
              </div>
            </section>

            <div className="card-grid">
              {feedItems.map((listing) => (
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
            </div>
            <NearbyBusinesses
              pincode={city?.pincode}
              cityId={city?.id ?? feed?.cityId}
              latitude={city?.latitude}
              longitude={city?.longitude}
              radiusKm={radiusKm}
              initial={homeBusinesses.items}
              initialHasMore={homeBusinesses.hasNextPage}
              verifiedLabel={searchLabels.businessVerified}
              claimLabel={searchLabels.businessClaim}
              directionsLabel={searchLabels.directions}
              viewProfileLabel={searchLabels.viewProfile}
              listingsLabel={searchLabels.listingCount}
              nearYou={searchLabels.nearYou}
              loadingLabel={searchLabels.loadingMoreBusinesses}
              kmLabel={t('common.km')}
              withinKm={searchLabels.withinKm}
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
                    <img
                      src={`/icons/categories/${categoryImageName(category.iconKey)}.webp`}
                      alt=""
                      width="64"
                      height="64"
                      loading="lazy"
                    />
                  </span>
                  <span>
                    {localisedCategoryName(category, locale)}
                    {countByCategory.get(category.id) ? (
                      <small className="category-chip__count">
                        {countByCategory.get(category.id)!.toLocaleString()} {t('home.countNearby')}
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
