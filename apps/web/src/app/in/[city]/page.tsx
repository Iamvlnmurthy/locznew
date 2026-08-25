import { cache } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { City } from '@locz/shared-types';
import { AdSlot } from '@/components/ad-slot';
import { Icon } from '@/components/icons';
import { getMessageGroup, getTranslator, type Locale } from '@/i18n';
import { ApiError, api, apiSafe } from '@/lib/api';
import { localizedName } from '@/lib/localized-name';
import { premiumCategoryArtwork } from '@/lib/premium-icon-catalog';
import { getLocale, localizedAlternates } from '@/lib/session';
import { loadNearbyBusinesses, type BusinessPage } from '../../search/businesses-actions';
import { NearbyBusinesses } from '../../search/nearby-businesses';
import styles from './page.module.css';

interface CityEditorial {
  shortIntro: string | null;
  description: string | null;
  famousFor: string | null;
  character: string | null;
  economySummary: string | null;
  climate: string | null;
  knownFor: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
}

interface CityGuideSection {
  key: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  license: string | null;
  source: string | null;
}

interface CityGuideImage {
  kind: 'HERO' | 'ATTRACTION' | 'MAP';
  title: string | null;
  url: string;
  attribution: string | null;
  license: string | null;
  source: string | null;
  width: number | null;
  height: number | null;
}

interface CityPageData {
  city: City;
  population: number | null;
  tier: 1 | 2 | 3;
  content: CityEditorial | null;
  sections: CityGuideSection[];
  images: CityGuideImage[];
}

interface BusinessCategory {
  id: string;
  slug: string;
  name: string;
  count: number;
}

const loadCityPage = cache(async (slug: string): Promise<CityPageData | null> => {
  try {
    return await api<CityPageData>(`/locations/cities/${encodeURIComponent(slug)}/content`, {
      revalidate: 86400,
      tags: ['cities', `city:${slug}`],
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    try {
      const city = await api<City>(`/locations/cities/${encodeURIComponent(slug)}`, {
        revalidate: 3600,
        tags: ['cities'],
      });
      return {
        city,
        population: null,
        tier: city.tier,
        content: null,
        sections: [],
        images: [],
      };
    } catch (fallbackError) {
      if (fallbackError instanceof ApiError && fallbackError.status === 404) return null;
      throw fallbackError;
    }
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  const [data, locale] = await Promise.all([loadCityPage(slug).catch(() => null), getLocale()]);
  const t = getTranslator(locale);
  if (!data) {
    return { title: t('discovery.cityNotFound'), robots: { index: false, follow: false } };
  }

  const cityName = localizedName(data.city, locale);
  const title = data.content?.seoTitle ?? t('discovery.cityMetadataTitle', { city: cityName });
  const description =
    data.content?.metaDescription ??
    t('discovery.cityMetadataDescription', { city: cityName, state: data.city.stateName });
  const hero = data.images.find((image) => image.kind === 'HERO');

  return {
    title,
    description,
    alternates: await localizedAlternates(`/in/${data.city.slug}`),
    openGraph: {
      title,
      description,
      type: 'website',
      locale: `${locale}_IN`,
      ...(hero ? { images: [{ url: hero.url, alt: hero.title ?? cityName }] } : {}),
    },
  };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: slug } = await params;
  const [locale, data] = await Promise.all([getLocale(), loadCityPage(slug)]);
  if (!data) notFound();

  const { city, content, sections, images } = data;
  const cityName = localizedName(city, locale);
  const [businesses, categoryRows, categoryCounts] = await Promise.all([
    loadNearbyBusinesses({ cityId: city.id, page: 1 }),
    apiSafe<Array<Omit<BusinessCategory, 'count'>>>('/businesses/categories', {
      revalidate: 86400,
    }),
    apiSafe<Array<{ categoryId: string; count: number }>>(
      `/businesses/category-counts?cityId=${city.id}`,
      { revalidate: 3600 },
    ),
  ]);
  const countByCategory = new Map(
    (categoryCounts ?? []).map(({ categoryId, count }) => [categoryId, count]),
  );
  const categories = (categoryRows ?? [])
    .map((category) => ({ ...category, count: countByCategory.get(category.id) ?? 0 }))
    .filter((category) => category.count > 0)
    .sort((a, b) => b.count - a.count);

  if (!content) {
    return (
      <ThinCityPage
        city={city}
        cityName={cityName}
        locale={locale}
        categories={categories ?? []}
        businesses={businesses}
      />
    );
  }

  const t = getTranslator(locale);
  const hero = images.find((image) => image.kind === 'HERO');
  const attractions = images.filter((image) => image.kind === 'ATTRACTION');
  const mapImage = images.find((image) => image.kind === 'MAP');
  const highlights = splitHighlights(content.famousFor ?? content.knownFor);
  const jsonLd = cityJsonLd(city, cityName, content.description, hero?.url);

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <section className={styles.hero}>
        {hero ? (
          <Image
            src={hero.url}
            alt={hero.title ?? `${cityName} city view`}
            fill
            sizes="100vw"
            priority
            className={styles.heroImage}
          />
        ) : (
          <div className={styles.heroFallback} aria-hidden="true" />
        )}
        <div className={styles.heroVeil} />
        <div className={`container ${styles.heroInner}`}>
          <nav className={styles.breadcrumbs} aria-label={t('common.breadcrumb')}>
            <Link href="/">{t('nav.home')}</Link>
            <span>›</span>
            <Link href="/cities">{t('cityDirectory.title')}</Link>
            <span>›</span>
            <span>{cityName}</span>
          </nav>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>{t('cityGuide.kicker')}</span>
            <h1>{cityName}</h1>
            <p>{heroIntro(content)}</p>
            <div className={styles.heroActions}>
              <Link href="#city-directory" className="btn btn--primary">
                {t('cityGuide.exploreLocal')} <Icon name="arrow" width="17" height="17" />
              </Link>
              <Link href="#city-guide" className={styles.secondaryAction}>
                {t('cityGuide.readGuide')} <Icon name="arrow" width="16" height="16" />
              </Link>
            </div>
          </div>
          <div className={styles.heroPlace}>
            <Icon name="location" width="18" height="18" />
            <span>
              <strong>{cityName}</strong>
              <small>{city.stateName}</small>
            </span>
          </div>
        </div>
        {hero ? <ImageCredit image={hero} dark /> : null}
      </section>

      <section className={`container ${styles.facts}`} aria-label={t('cityGuide.quickFacts')}>
        <Fact
          icon="user"
          label={t('cityGuide.population')}
          value={formatPopulation(data.population, locale)}
        />
        <Fact icon="sparkles" label={t('cityGuide.cityTier')} value={`Tier ${data.tier}`} />
        <Fact
          icon="location"
          label={t('cityGuide.region')}
          value={city.districtName ?? city.stateName}
        />
        <Fact
          icon="weather"
          label={t('cityGuide.climate')}
          value={content.climate ?? t('cityGuide.localClimate')}
        />
      </section>

      <div className={`container ${styles.body}`}>
        <section id="city-about" className={styles.about} aria-labelledby="city-about-title">
          <div>
            <span className={styles.sectionKicker}>{t('cityGuide.aboutKicker')}</span>
            <h2 id="city-about-title">{t('cityGuide.aboutTitle', { city: cityName })}</h2>
            {paragraphs(content.description).map((paragraph, index) => (
              <p key={index}>{normalizeCityCopy(paragraph)}</p>
            ))}
            {content.character ? <p>{normalizeCityCopy(content.character)}</p> : null}
          </div>
          <aside className={styles.famousCard}>
            <span className={styles.famousIcon}>
              <Icon name="sparkles" />
            </span>
            <span className={styles.sectionKicker}>{t('cityGuide.famousKicker')}</span>
            <h2>{t('cityGuide.famousTitle', { city: cityName })}</h2>
            {highlights.length ? (
              <ul>
                {highlights.map((item) => (
                  <li key={item}>
                    <Icon name="check" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{content.knownFor}</p>
            )}
          </aside>
        </section>

        {attractions.length ? (
          <section
            id="city-landmarks"
            className={styles.landmarks}
            aria-labelledby="city-landmarks-title"
          >
            <SectionHeading
              kicker={t('cityGuide.landmarksKicker')}
              title={t('cityGuide.landmarksTitle', { city: cityName })}
            />
            <div className={styles.landmarkGrid}>
              {attractions.slice(0, 6).map((image, index) => (
                <figure key={`${image.url}-${index}`} className={styles.landmarkCard}>
                  <div>
                    <Image
                      src={image.url}
                      alt={image.title ?? ''}
                      fill
                      sizes="(max-width: 720px) 88vw, 31vw"
                    />
                  </div>
                  <figcaption>
                    <strong>{image.title ?? cityName}</strong>
                    <ImageCredit image={image} />
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        <CityDirectory
          city={city}
          cityName={cityName}
          locale={locale}
          categories={categories ?? []}
          businesses={businesses}
        />

        <section
          id="city-location"
          className={styles.mapSection}
          aria-labelledby="city-location-title"
        >
          <div className={styles.mapCopy}>
            <span className={styles.sectionKicker}>{t('cityGuide.locationKicker')}</span>
            <h2 id="city-location-title">{t('cityGuide.locationTitle', { city: cityName })}</h2>
            <p>{t('cityGuide.locationText', { city: cityName, state: city.stateName })}</p>
            <dl>
              <div>
                <dt>{t('cityGuide.latitude')}</dt>
                <dd>{city.latitude.toFixed(4)}°</dd>
              </div>
              <div>
                <dt>{t('cityGuide.longitude')}</dt>
                <dd>{city.longitude.toFixed(4)}°</dd>
              </div>
            </dl>
            <a
              href={`https://www.openstreetmap.org/?mlat=${city.latitude}&mlon=${city.longitude}#map=11/${city.latitude}/${city.longitude}`}
              target="_blank"
              rel="noreferrer"
              className={styles.mapLink}
            >
              {t('cityGuide.openMap')} <Icon name="arrow" width="15" height="15" />
            </a>
          </div>
          <figure className={styles.mapVisual}>
            {mapImage ? (
              <Image
                src={mapImage.url}
                alt={mapImage.title ?? `${cityName} map`}
                fill
                sizes="(max-width: 800px) 100vw, 48vw"
              />
            ) : (
              <MapFallback city={city} cityName={cityName} />
            )}
            {mapImage ? (
              <figcaption>
                <ImageCredit image={mapImage} />
              </figcaption>
            ) : null}
          </figure>
          <p className={styles.mapCaveat}>{t('cityGuide.mapCaveat')}</p>
        </section>

        <AdSlot placement="CITY_AFTER_LOCATION" contentScore={sections.length} />

        {sections.length ? (
          <section id="city-guide" className={styles.guide} aria-labelledby="city-guide-title">
            <SectionHeading
              kicker={t('cityGuide.guideKicker')}
              title={t('cityGuide.guideTitle', { city: cityName })}
              intro={t('cityGuide.guideIntro')}
            />
            <div className={styles.guideGrid}>
              {sections.slice(0, 2).map((section, index) => (
                <GuideCard
                  key={`${section.key}-${index}`}
                  section={section}
                  index={index}
                  readMore={t('cityGuide.readFullSection')}
                />
              ))}
              <AdSlot
                placement="CITY_GUIDE_IN_BODY"
                contentScore={sections.length}
                className={styles.guideAd}
              />
              {sections.slice(2).map((section, offset) => {
                const index = offset + 2;
                return (
                  <GuideCard
                    key={`${section.key}-${index}`}
                    section={section}
                    index={index}
                    readMore={t('cityGuide.readFullSection')}
                  />
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function ThinCityPage({
  city,
  cityName,
  locale,
  categories,
  businesses,
}: {
  city: City;
  cityName: string;
  locale: Locale;
  categories: BusinessCategory[];
  businesses: BusinessPage;
}) {
  const t = getTranslator(locale);
  return (
    <main className={styles.page}>
      <section className={`${styles.hero} ${styles.thinHero}`}>
        <div className={styles.heroFallback} />
        <div className={styles.heroVeil} />
        <div className={`container ${styles.heroInner}`}>
          <nav className={styles.breadcrumbs} aria-label={t('common.breadcrumb')}>
            <Link href="/">{t('nav.home')}</Link>
            <span>›</span>
            <Link href="/cities">{t('cityDirectory.title')}</Link>
            <span>›</span>
            <span>{cityName}</span>
          </nav>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>{t('discovery.cityEyebrow', { city: cityName })}</span>
            <h1>{t('discovery.cityTitle', { city: cityName })}</h1>
            <p>{t('discovery.citySubtitle', { city: cityName, state: city.stateName })}</p>
          </div>
        </div>
      </section>
      <div className={`container ${styles.body}`}>
        <CityDirectory
          city={city}
          cityName={cityName}
          locale={locale}
          categories={categories}
          businesses={businesses}
        />
      </div>
    </main>
  );
}

function CityDirectory({
  city,
  cityName,
  locale,
  categories,
  businesses,
}: {
  city: City;
  cityName: string;
  locale: Locale;
  categories: BusinessCategory[];
  businesses: BusinessPage;
}) {
  const t = getTranslator(locale);
  const searchLabels = getMessageGroup(locale, 'searchUi');
  return (
    <section
      id="city-directory"
      className={styles.directory}
      aria-labelledby="city-directory-title"
    >
      <div className={styles.directoryIntro}>
        <span className={styles.sectionKicker}>{t('cityGuide.directoryKicker')}</span>
        <h2 id="city-directory-title">{t('cityGuide.directoryTitle', { city: cityName })}</h2>
        <p>{t('cityGuide.directoryIntro', { city: cityName })}</p>
        <form className={styles.directorySearch} action="/business" method="get" role="search">
          <input type="hidden" name="cityId" value={city.id} />
          <Icon name="search" width="19" height="19" />
          <input
            name="q"
            type="search"
            aria-label={t('search.submit')}
            placeholder={t('discovery.searchCity', { city: cityName })}
          />
          <button type="submit" aria-label={t('search.submit')}>
            <Icon name="arrow" />
          </button>
        </form>
        <div className={styles.directoryProof}>
          <strong>{businesses.total.toLocaleString(`${locale}-IN`)}</strong>
          <span>{t('discovery.localListings')}</span>
        </div>
      </div>
      {categories.length ? (
        <nav className={styles.categoryRail} aria-label={t('feed.browseCategories')}>
          {categories.slice(0, 8).map((category) => (
            <Link key={category.id} href={`/in/${city.slug}/${category.slug}`}>
              <span>
                <Image
                  src={premiumCategoryArtwork({ slug: category.slug, name: category.name })}
                  alt=""
                  width="58"
                  height="58"
                />
              </span>
              <span className={styles.categoryCopy}>
                <strong>{category.name}</strong>
                <small>{category.count.toLocaleString(`${locale}-IN`)}</small>
              </span>
              <Icon name="arrow" />
            </Link>
          ))}
        </nav>
      ) : null}
      {/* Text-link continuation of the visual rail. The rail shows the top 8; the sitemap indexes the
          top 45 city×category hubs, so without this the other ~37 hubs had no internal feeder link
          and leaned entirely on the sitemap to be crawled. Cheap link equity to every indexable hub —
          and a real "browse all categories" affordance for visitors. */}
      {categories.length > 8 ? (
        <nav className={styles.categoryLinks} aria-label={t('feed.browseCategories')}>
          {categories.slice(8, 45).map((category) => (
            <Link key={`hub-${category.id}`} href={`/in/${city.slug}/${category.slug}`}>
              {category.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {businesses.items.length === 0 ? (
        <div className={styles.empty}>
          <Image src="/illustrations/empty-neighbourhood.webp" alt="" width="220" height="180" />
          <div>
            <h3>{t('discovery.beFirst', { city: cityName })}</h3>
            <p>{t('feed.empty')}</p>
            <Link href="/post" className="btn btn--primary">
              <Icon name="plus" /> {t('nav.post')}
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.directoryListings}>
          <NearbyBusinesses
            cityId={city.id}
            initial={businesses.items.slice(0, 9)}
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
            allCategoriesLabel={searchLabels.allCategories}
            verifiedOnlyLabel={searchLabels.verifiedOnly}
            emptyLabel={searchLabels.noBusinessesMatch}
          />
        </div>
      )}
      <Link href={`/business?cityId=${city.id}`} className={styles.seeAll}>
        {t('feed.seeAll')} {t('discovery.localListings')} <Icon name="arrow" />
      </Link>
    </section>
  );
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <span>
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
function SectionHeading({
  kicker,
  title,
  intro,
}: {
  kicker: string;
  title: string;
  intro?: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <span className={styles.sectionKicker}>{kicker}</span>
      <h2>{title}</h2>
      {intro ? <p>{intro}</p> : null}
    </div>
  );
}
function GuideCard({
  section,
  index,
  readMore,
}: {
  section: CityGuideSection;
  index: number;
  readMore: string;
}) {
  const preview = sectionPreview(section.content);
  return (
    <article className={styles.guideCard}>
      <span className={styles.guideNumber}>{String(index + 1).padStart(2, '0')}</span>
      <h3>{section.title}</h3>
      <p className={styles.guidePreview}>{preview}</p>
      {section.content.length > preview.length ? (
        <details className={styles.guideDetails}>
          <summary>
            {readMore} <Icon name="arrow" />
          </summary>
          <div>
            {paragraphs(section.content).map((paragraph, partIndex) => (
              <p key={partIndex}>{paragraph}</p>
            ))}
          </div>
        </details>
      ) : null}
      <SourceCredit section={section} />
    </article>
  );
}
function SourceCredit({ section }: { section: CityGuideSection }) {
  const label = [section.source, section.license].filter(Boolean).join(' · ') || 'Source';
  return section.sourceUrl ? (
    <a href={section.sourceUrl} target="_blank" rel="noreferrer" className={styles.source}>
      Reference text from {label} <span>↗</span>
    </a>
  ) : (
    <span className={styles.source}>Reference text from {label}</span>
  );
}
function ImageCredit({ image, dark = false }: { image: CityGuideImage; dark?: boolean }) {
  const label = [image.attribution, image.source, image.license].filter(Boolean).join(' · ');
  if (!label) return null;
  return (
    <small className={`${styles.imageCredit} ${dark ? styles.imageCreditDark : ''}`}>{label}</small>
  );
}
function MapFallback({ city, cityName }: { city: City; cityName: string }) {
  return (
    <div className={styles.mapFallback}>
      <span className={styles.mapGrid} />
      <span className={styles.mapPin}>
        <Icon name="location" />
        <strong>{cityName}</strong>
        <small>{city.stateName}</small>
      </span>
    </div>
  );
}
function paragraphs(value: string | null): string[] {
  if (!value) return [];
  const explicit = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (explicit.length > 1 || value.length < 620) return explicit;
  const sentences = value
    .match(/[^.!?]+[.!?]+(?:[”’"']|$)?|[^.!?]+$/g)
    ?.map((part) => part.trim())
    .filter(Boolean) ?? [value];
  const grouped: string[] = [];
  let current = '';
  let words = 0;
  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).length;
    if (current && words + sentenceWords > 105) {
      grouped.push(current);
      current = sentence;
      words = sentenceWords;
    } else {
      current = `${current} ${sentence}`.trim();
      words += sentenceWords;
    }
  }
  if (current) grouped.push(current);
  return grouped;
}
function sectionPreview(value: string): string {
  const clean = normalizeCityCopy(value.replace(/\s+/g, ' ').trim());
  const sentences = clean.match(/[^.!?]+[.!?]+(?:[”’"']|$)?|[^.!?]+$/g) ?? [clean];
  const lead = sentences.slice(0, 2).join(' ').trim();
  if (lead.length <= 280) return lead;
  const clipped = lead
    .slice(0, 277)
    .replace(/\s+\S*$/, '')
    .trim();
  return `${clipped}…`;
}
function splitHighlights(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\s*[•|;,]\s*/)
    .map((part) => normalizeCityCopy(part))
    .filter((part) => part.length > 1)
    .slice(0, 6);
}
function normalizeCityCopy(value: string): string {
  return value
    .replace(/\bknown for it\b/gi, 'known for IT')
    .replace(/\bmix of it\b/gi, 'mix of IT')
    .replace(/;\s*/g, ', ');
}
function heroIntro(content: CityEditorial): string {
  const descriptionLead = content.description?.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  return normalizeCityCopy(descriptionLead ?? content.shortIntro ?? content.description ?? '');
}
function formatPopulation(value: number | null, locale: Locale): string {
  return value ? value.toLocaleString(`${locale}-IN`) : '—';
}
function cityJsonLd(city: City, cityName: string, description: string | null, image?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${cityName} city guide`,
    description,
    ...(image ? { image } : {}),
    about: {
      '@type': 'City',
      name: cityName,
      address: {
        '@type': 'PostalAddress',
        addressLocality: cityName,
        addressRegion: city.stateName,
        addressCountry: 'IN',
      },
      geo: { '@type': 'GeoCoordinates', latitude: city.latitude, longitude: city.longitude },
    },
  };
}
