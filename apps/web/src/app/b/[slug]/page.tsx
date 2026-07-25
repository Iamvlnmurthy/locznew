import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { getTranslator } from '@/i18n';
import { ApiError, SITE_URL, api, apiSafe } from '@/lib/api';
import { getLocale } from '@/lib/session';

interface BusinessHour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

interface BusinessDetail {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  description: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  primaryPhone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  website: string | null;
  verificationStatus: string;
  hours: BusinessHour[];
  listingCount: number;
  viewCount: number;
  isOwner: boolean;
  createdAt: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function loadBusiness(slug: string): Promise<BusinessDetail | null> {
  try {
    return await api<BusinessDetail>(`/businesses/${encodeURIComponent(slug)}`, { auth: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const business = await loadBusiness(slug).catch(() => null);

  if (!business) {
    return { title: 'Business not found', robots: { index: false, follow: false } };
  }

  const title = `${business.name} — ${business.categoryName} in ${business.cityName}`;
  const description =
    business.description?.replace(/\s+/g, ' ').slice(0, 155) ??
    `${business.name} is a ${business.categoryName.toLowerCase()} in ${business.cityName}. Find contact details, offers and jobs on LocZ.`;

  return {
    title,
    description,
    alternates: { canonical: `/b/${business.slug}` },
    openGraph: { title, description, type: 'website', url: `${SITE_URL}/b/${business.slug}` },
  };
}

/**
 * Public business profile.
 *
 * `LocalBusiness` structured data is what puts a business into map results and knowledge
 * panels — for a local directory that is most of the point of having the page.
 */
export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [locale, business] = await Promise.all([getLocale(), loadBusiness(slug)]);

  if (!business) notFound();

  const t = getTranslator(locale);

  const listings = await apiSafe<{ items: ListingSummary[] }>(
    `/search?businessId=${business.id}&limit=12`,
    { revalidate: 300 },
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    description: business.description ?? undefined,
    url: `${SITE_URL}/b/${business.slug}`,
    telephone: business.primaryPhone ?? undefined,
    email: business.email ?? undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.addressLine ?? undefined,
      addressLocality: business.cityName,
      addressCountry: 'IN',
    },
    ...(business.latitude && business.longitude
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: business.latitude,
            longitude: business.longitude,
          },
        }
      : {}),
    openingHoursSpecification: business.hours
      .filter((hour) => !hour.isClosed)
      .map((hour) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAYS[hour.dayOfWeek]}`,
        opens: hour.opensAt,
        closes: hour.closesAt,
      })),
  };

  return (
    <div className="container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">{t('nav.home')}</Link>
        <span>›</span>
        <span>{business.cityName}</span>
        <span>›</span>
        <span>{business.categoryName}</span>
      </nav>

      <h1 className="page-title" style={{ overflowWrap: 'anywhere' }}>
        {business.name}
        {business.verificationStatus === 'VERIFIED' ? (
          <span className="badge badge--free" style={{ marginLeft: 12, verticalAlign: 'middle' }}>
            ✓ Verified
          </span>
        ) : null}
      </h1>
      <p className="page-subtitle">
        {business.categoryName} · {business.cityName}
        {business.addressLine ? ` · ${business.addressLine}` : ''}
      </p>

      <div className="detail">
        <div>
          {business.description ? (
            <section className="panel">
              <h2 style={{ marginTop: 0, fontSize: '1.0625rem' }}>{t('listing.description')}</h2>
              <p className="detail__description">{business.description}</p>
            </section>
          ) : null}

          {business.hours.length > 0 ? (
            <section className="panel">
              <h2 style={{ marginTop: 0, fontSize: '1.0625rem' }}>Opening hours</h2>
              <dl className="attr-list">
                {business.hours.map((hour) => (
                  <div key={`${hour.dayOfWeek}-${hour.opensAt}`}>
                    <dt>{DAYS[hour.dayOfWeek]}</dt>
                    <dd>{hour.isClosed ? 'Closed' : `${hour.opensAt} – ${hour.closesAt}`}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {listings && listings.items.length > 0 ? (
            <section className="section">
              <div className="section__head">
                <h2>From this business</h2>
              </div>
              <div className="card-grid">
                {listings.items.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} t={t} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside>
          <div className="panel">
            <h2 style={{ marginTop: 0, fontSize: '0.9375rem' }}>Contact</h2>

            {business.primaryPhone ? (
              <a href={`tel:${business.primaryPhone}`} className="btn btn--primary btn--block">
                {business.primaryPhone}
              </a>
            ) : null}

            {business.whatsappNumber ? (
              <a
                href={`https://wa.me/${business.whatsappNumber.replace('+', '')}`}
                className="btn btn--outline btn--block"
                style={{ marginTop: 8 }}
                rel="noopener noreferrer"
                target="_blank"
              >
                WhatsApp
              </a>
            ) : null}

            {business.website ? (
              <a
                href={business.website}
                className="btn btn--outline btn--block"
                style={{ marginTop: 8 }}
                // Untrusted outbound link supplied by the business owner: nofollow keeps
                // the directory from becoming an SEO farm.
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                Website
              </a>
            ) : null}

            {!business.primaryPhone && !business.whatsappNumber && !business.website ? (
              <p className="field__hint">This business has not added contact details yet.</p>
            ) : null}

            <p className="detail__meta" style={{ marginTop: 16 }}>
              {business.listingCount} listing{business.listingCount === 1 ? '' : 's'} ·{' '}
              {business.viewCount} views
            </p>

            {business.isOwner ? (
              <Link
                href="/dashboard"
                className="btn btn--ghost btn--block"
                style={{ marginTop: 12 }}
              >
                Manage this business
              </Link>
            ) : (
              <p style={{ marginTop: 16, marginBottom: 0 }}>
                <Link
                  href={`/report?business=${business.id}`}
                  style={{ color: 'var(--locz-text-muted)', fontSize: '0.8125rem' }}
                >
                  Report this business
                </Link>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
