import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ListingSummary } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import { ListingCard } from '@/components/listing-card';
import { getMessageGroup, getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { premiumDiscoveryArtwork } from '@/lib/premium-icon-catalog';
import { getLocale, getSelectedCity, getSelectedRadius } from '@/lib/session';
import { NearbyBusinesses } from '../../search/nearby-businesses';
import { loadNearbyBusinesses } from '../../search/businesses-actions';

interface Feed {
  cityId: string;
  cityName: string;
  sections: Array<{ items: ListingSummary[] }>;
}

interface LocalWeather {
  tempC: number;
  description: string;
  condition: string;
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
}

interface LocalAlert {
  title: string;
  category: string | null;
  publishedAt: string | null;
}

const destinations = [
  'local-now',
  'businesses',
  'jobs',
  'news',
  'alerts',
  'deals',
  'services',
  'marketplace',
] as const;

type Destination = (typeof destinations)[number];

const listingTypes: Partial<Record<Destination, ReadonlySet<ListingSummary['type']>>> = {
  'local-now': new Set(['EVENT', 'BUYER_REQUIREMENT', 'RENTAL']),
  businesses: new Set(['BUSINESS_LISTING']),
  jobs: new Set(['JOB']),
  deals: new Set(['OFFER']),
  services: new Set(['SERVICE']),
  marketplace: new Set(['PRODUCT', 'CLASSIFIED']),
};

export const dynamic = 'force-dynamic';

export default async function DiscoveryAreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area: rawArea } = await params;
  if (!destinations.includes(rawArea as Destination)) notFound();
  const area = rawArea as Destination;

  const [locale, city, radiusKm] = await Promise.all([
    getLocale(),
    getSelectedCity(),
    getSelectedRadius(),
  ]);
  const t = getTranslator(locale);
  const areaLabels = getMessageGroup(locale, 'discoveryAreas');
  const searchLabels = getMessageGroup(locale, 'searchUi');
  const d = getMessageGroup(locale, 'discoverUi');
  // Fall back to the default launched city so the page (and crawlers) still get real Hyderabad
  // content instead of an empty "Your city" — an empty discovery page is thin content and a poor
  // first visit. Coordinates from the cookie win; otherwise the default city's centroid is used.
  const defaultCity = city
    ? null
    : ((await apiSafe<Array<{ id: string; name: string; latitude?: number; longitude?: number }>>(
        '/locations/cities?launchedOnly=true&limit=1',
        { revalidate: 3600 },
      )) ?? [])[0];
  const place = city ?? defaultCity ?? null;
  const cityName = place?.name ?? t('home.yourCity');
  const title = areaLabels[area] ?? area;

  const feedQuery = new URLSearchParams({ limit: '30' });
  if (place?.id) feedQuery.set('cityId', place.id);
  if (city?.pincode) feedQuery.set('pincode', city.pincode);
  if (place?.latitude !== undefined && place.longitude !== undefined) {
    feedQuery.set('latitude', String(place.latitude));
    feedQuery.set('longitude', String(place.longitude));
    feedQuery.set('radiusKm', String(radiusKm));
  }

  const showWeather = false;
  const showAlerts = area === 'alerts';
  const showNews = area === 'news';
  const showJobs = area === 'jobs';
  const showBusinesses = area === 'businesses';
  const alertQuery = new URLSearchParams({ q: cityName });
  if (place?.id) alertQuery.set('cityId', place.id);

  const [feed, weatherResponse, newsResponse, alertResponse, jobsResponse, businesses] =
    await Promise.all([
      apiSafe<Feed>(`/feed?${feedQuery.toString()}`, { auth: true }),
      showWeather && city?.latitude !== undefined && city.longitude !== undefined
        ? apiSafe<{ weather: LocalWeather | null }>(
            `/local-now/weather?latitude=${city.latitude}&longitude=${city.longitude}`,
          )
        : Promise.resolve(null),
      showNews
        ? apiSafe<{ headlines: NewsHeadline[] }>(
            `/local-now/news?q=${encodeURIComponent(cityName)}`,
          )
        : Promise.resolve(null),
      showAlerts
        ? apiSafe<{ alerts: LocalAlert[] }>(`/local-now/alerts?${alertQuery.toString()}`)
        : Promise.resolve(null),
      showJobs
        ? apiSafe<{ jobs: JobPosting[] }>(`/local-now/jobs?q=${encodeURIComponent(cityName)}`)
        : Promise.resolve(null),
      showBusinesses
        ? place?.latitude !== undefined && place.longitude !== undefined
          ? loadNearbyBusinesses({
              latitude: place.latitude,
              longitude: place.longitude,
              radiusKm,
              pincode: city?.pincode,
              page: 1,
            })
          : city?.pincode
            ? loadNearbyBusinesses({ pincode: city.pincode, page: 1 })
            : place?.id
              ? loadNearbyBusinesses({ cityId: place.id, page: 1 })
              : Promise.resolve({ items: [], total: 0, page: 1, hasNextPage: false })
        : Promise.resolve({ items: [], total: 0, page: 1, hasNextPage: false }),
    ]);

  const types = listingTypes[area];
  const seen = new Set<string>();
  const listings = (feed?.sections ?? [])
    .flatMap((section) => section.items)
    .filter((item) => {
      if (seen.has(item.id) || (types && !types.has(item.type))) return false;
      seen.add(item.id);
      return true;
    });
  const weather = weatherResponse?.weather ?? null;
  const news = newsResponse?.headlines ?? [];
  const alerts = alertResponse?.alerts ?? [];
  const jobs = jobsResponse?.jobs ?? [];

  return (
    <main className="discovery-feed-page">
      <header className="discovery-feed-hero">
        <div className="container discovery-feed-hero__inner">
          <Link href="/" className="discovery-feed-hero__back">
            <Icon name="arrow" /> {t('home.explore')}
          </Link>
          <div className="discovery-feed-hero__identity">
            <span>
              <Image src={premiumDiscoveryArtwork(area)} alt="" width={92} height={92} priority />
            </span>
            <div>
              <small>{cityName}</small>
              <h1>{title}</h1>
              <p>{d.tagline}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container discovery-feed-shell">
        <aside className="discovery-feed-rail" aria-label={t('home.explore')}>
          {destinations.map((destination) => (
            <Link
              key={destination}
              href={`/discover/${destination}`}
              className={destination === area ? 'is-active' : ''}
            >
              <Image src={premiumDiscoveryArtwork(destination)} alt="" width={38} height={38} />
              <span>{areaLabels[destination] ?? destination}</span>
            </Link>
          ))}
        </aside>

        <div className="discovery-feed-stream">
          <div className="discovery-feed-toolbar">
            <strong>{title}</strong>
            <nav aria-label={searchLabels.filters}>
              <span className="is-active">{searchLabels.nearestFirst}</span>
              <Link href="/search">
                <Icon name="sliders" /> {searchLabels.filters}
              </Link>
            </nav>
          </div>

          {weather ? (
            <section className="discovery-source-card discovery-source-card--weather">
              <span>☀️</span>
              <div>
                <small>{d.localWeather}</small>
                <strong>
                  {weather.tempC}°C · {weather.description}
                </strong>
              </div>
              <i>{'MET Norway'}</i>
            </section>
          ) : null}

          {alerts.length > 0 ? (
            <section className="discovery-source-section">
              <div className="discovery-source-section__head">
                <span>{d.officialAlerts}</span>
                <small>{'NDMA SACHET'}</small>
              </div>
              {alerts.map((alert) => (
                <article
                  key={`${alert.title}-${alert.publishedAt}`}
                  className="discovery-text-card discovery-text-card--alert"
                >
                  <Icon name="alert" />
                  <div>
                    <strong>{alert.title}</strong>
                    <small>{alert.category ?? d.localAdvisory}</small>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          {news.length > 0 ? (
            <section className="discovery-source-section">
              <div className="discovery-source-section__head">
                <span>{d.localNews}</span>
                <small>{'Google News'}</small>
              </div>
              {news.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="discovery-text-card"
                >
                  <span className="discovery-text-card__dot" />
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.source}</small>
                  </div>
                  <Icon name="arrow" />
                </a>
              ))}
            </section>
          ) : null}

          {jobs.length > 0 ? (
            <section className="discovery-source-section">
              <div className="discovery-source-section__head">
                <span>{d.workNearby}</span>
                <small>{'Adzuna'}</small>
              </div>
              {jobs.map((job) => (
                <a
                  key={job.url}
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="discovery-text-card"
                >
                  <span className="discovery-text-card__icon">
                    <Icon name="briefcase" />
                  </span>
                  <div>
                    <strong>{job.title}</strong>
                    <small>{[job.company, job.location].filter(Boolean).join(' · ')}</small>
                  </div>
                  <Icon name="arrow" />
                </a>
              ))}
            </section>
          ) : null}

          {listings.length > 0 ? (
            <section className="discovery-source-section">
              <div className="discovery-source-section__head">
                <span>{d.fromCommunity}</span>
                <small>{'LocZ'}</small>
              </div>
              <div className="discovery-listing-feed">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} t={t} />
                ))}
              </div>
            </section>
          ) : null}

          {showBusinesses && businesses.items.length > 0 ? (
            <section
              className="search-businesses discovery-businesses"
              aria-labelledby="discovery-businesses-title"
            >
              <div className="search-businesses__head">
                <h2 id="discovery-businesses-title">{searchLabels.businessesTitle}</h2>
              </div>
              <NearbyBusinesses
                pincode={city?.pincode}
                cityId={place?.id ?? feed?.cityId}
                latitude={place?.latitude}
                longitude={place?.longitude}
                radiusKm={radiusKm}
                initial={businesses.items}
                initialHasMore={businesses.hasNextPage}
                verifiedLabel={searchLabels.businessVerified}
                claimLabel={searchLabels.businessClaim}
                directionsLabel={searchLabels.directions}
                viewProfileLabel={searchLabels.viewProfile}
                listingsLabel={searchLabels.listingCount}
                nearYou={searchLabels.nearYou}
                loadingLabel={searchLabels.loadingMoreBusinesses}
                kmLabel={t('common.km')}
                withinKm={searchLabels.withinKm}
                areaOptions={[]}
                allCategoriesLabel={searchLabels.allCategories}
                verifiedOnlyLabel={searchLabels.verifiedOnly}
                emptyLabel={searchLabels.noBusinessesMatch}
              />
            </section>
          ) : null}

          {!weather &&
          alerts.length === 0 &&
          news.length === 0 &&
          jobs.length === 0 &&
          listings.length === 0 &&
          businesses.items.length === 0 ? (
            <div className="discovery-feed-empty">
              <Image src={premiumDiscoveryArtwork(area)} alt="" width={92} height={92} />
              <h2>{d.emptyTitle}</h2>
              <p>{d.emptyBody}</p>
              <Link href="/search" className="btn btn--primary">
                {d.searchCta}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
      <Link href="/" className="discovery-feed-mobile-back" aria-label={t('home.explore')}>
        <Icon name="arrow" />
      </Link>
    </main>
  );
}
