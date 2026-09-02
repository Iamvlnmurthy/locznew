import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ServiceTradeIcon } from '@/components/service-trade-icon';
import { getMessageGroup } from '@/i18n';
import { SITE_URL, apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity, localizedAlternates } from '@/lib/session';
import { ServiceFinder, type FinderOption } from './service-finder';
import styles from './page.module.css';

interface BusinessCategory extends FinderOption {
  id: string;
  count: number;
}

interface Locality extends FinderOption {
  id: string;
}

const FEATURED_TRADES = [
  'professional-services',
  'hospitals-and-clinics',
  'financial-services',
  'property-services',
  'beauty-salons',
  'travel-services',
  'event-planners',
  'it-companies',
] as const;

// Interim: a category alone has no page (route is /services/[category]/[area]), so link each
// category card straight to a real providers page (a known-populated area). Codex replaces this
// with a proper /services/[category] area-list landing (see docs/SERVICES_LANDING_NAV_BUGFIX.md).
const TRADE_AREA: Record<string, string> = {
  'professional-services': 'kukatpally',
  'hospitals-and-clinics': 'kukatpally',
  'financial-services': 'kukatpally',
  'property-services': 'kukatpally',
  'beauty-salons': 'kukatpally',
  'travel-services': 'kukatpally',
  'event-planners': 'kukatpally',
  'it-companies': 'kukatpally',
};

const FALLBACK_AREAS: FinderOption[] = [
  { slug: 'banjara-hills', name: 'Banjara Hills' },
  { slug: 'jubilee-hills', name: 'Jubilee Hills' },
  { slug: 'kukatpally', name: 'Kukatpally' },
  { slug: 'hsr-layout', name: 'HSR Layout' },
  { slug: 'andheri-east', name: 'Andheri East' },
  { slug: 'anna-nagar-chennai', name: 'Anna Nagar' },
  { slug: 'alkapuri', name: 'Alkapuri' },
  { slug: 'navrangpura', name: 'Navrangpura' },
];

export const revalidate = 1800;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const s = getMessageGroup(locale, 'serviceMarketplace');
  return {
    title: s.metaTitle,
    description: s.metaDescription,
    alternates: await localizedAlternates('/services'),
    openGraph: {
      title: s.metaTitle,
      description: s.metaDescription,
      type: 'website',
      url: `${SITE_URL}/services`,
    },
  };
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string; area?: string }>;
}) {
  const [locale, city, query, allCategories] = await Promise.all([
    getLocale(),
    getSelectedCity(),
    searchParams,
    apiSafe<BusinessCategory[]>('/businesses/categories', { revalidate: 1800 }),
  ]);
  const s = getMessageGroup(locale, 'serviceMarketplace');
  const categoryMap = new Map((allCategories ?? []).map((item) => [item.slug, item]));
  const featured = FEATURED_TRADES.map((slug) => categoryMap.get(slug)).filter(
    (item): item is BusinessCategory => Boolean(item),
  );
  const localities = city?.id
    ? ((await apiSafe<Locality[]>(`/locations/cities/${city.id}/localities`, {
        revalidate: 86400,
      })) ?? [])
    : [];
  const areas = localities.length ? localities.slice(0, 80) : FALLBACK_AREAS;
  const initialCategory = featured.some((item) => item.slug === query.trade)
    ? query.trade
    : featured[0]?.slug;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Image
          src="/illustrations/services/services-marketplace-hero.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 760px) 100vw, 1320px"
          className={styles.heroImage}
        />
        <div className={styles.heroVeil} aria-hidden="true" />
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>{s.eyebrow}</span>
          <h1>{s.heroTitle}</h1>
          <p>{s.heroBody}</p>
          <div className={styles.heroProof}>
            <span>
              <strong>9.5L+</strong> {s.providers}
            </span>
            <span>
              <strong>16K+</strong> {s.serviceAreas}
            </span>
          </div>
        </div>
        <div className={styles.finderWrap}>
          <ServiceFinder
            categories={featured}
            areas={areas}
            initialCategory={initialCategory}
            initialArea={query.area}
            labels={{
              category: s.finderCategory,
              categoryPlaceholder: s.finderCategoryPlaceholder,
              area: s.finderArea,
              areaPlaceholder: s.finderAreaPlaceholder,
              submit: s.finderSubmit,
              missing: s.finderMissing,
            }}
          />
        </div>
      </section>

      <section className={styles.trades} aria-labelledby="popular-trades-heading">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>{s.tradesEyebrow}</span>
            <h2 id="popular-trades-heading">{s.tradesTitle}</h2>
          </div>
          <p>{s.tradesBody}</p>
        </div>
        <div className={styles.tradeGrid}>
          {featured.map((trade, index) => (
            <Link
              href={
                TRADE_AREA[trade.slug]
                  ? `/services/${trade.slug}/${TRADE_AREA[trade.slug]}`
                  : `/services?trade=${trade.slug}`
              }
              className={styles.tradeCard}
              key={trade.id}
              style={{ '--stagger': index } as CSSProperties}
            >
              <span className={styles.tradeStamp}>
                <ServiceTradeIcon slug={trade.slug} />
              </span>
              <span className={styles.tradeCardBody}>
                <strong>{trade.name}</strong>
                <small>
                  {trade.count.toLocaleString(`${locale}-IN`)} {s.providers}
                </small>
              </span>
              <span className={styles.tradeArrow} aria-hidden="true">
                ↗
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.steps} aria-labelledby="steps-heading">
        <div className={styles.stepsIntro}>
          <span className={styles.eyebrow}>{s.stepsEyebrow}</span>
          <h2 id="steps-heading">{s.stepsTitle}</h2>
          <p>{s.stepsBody}</p>
        </div>
        <ol>
          {[s.stepOne, s.stepTwo, s.stepThree].map((step, index) => (
            <li key={step}>
              <span>0{index + 1}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.areas} aria-labelledby="areas-heading">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>{s.areasEyebrow}</span>
            <h2 id="areas-heading">{s.areasTitle.replace('{city}', city?.name || s.yourCity)}</h2>
          </div>
          <Link href="/location">{s.changeLocation}</Link>
        </div>
        <div className={styles.areaChips}>
          {areas.slice(0, 12).map((area) => (
            <Link href={`/services?area=${area.slug}`} key={area.slug}>
              {area.name}
              <span>→</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
