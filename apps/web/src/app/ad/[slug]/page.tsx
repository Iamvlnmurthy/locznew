import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, SITE_URL, api, apiSafe } from '@/lib/api';
import { getTranslator } from '@/i18n';
import { getCurrentUser, getLocale } from '@/lib/session';
import { formatPrice } from '@/components/listing-card';
import { SaveButton } from './save-button';
import { ContactPanel } from './contact-panel';

interface ListingMedia {
  id: string;
  thumbUrl: string | null;
  cardUrl: string | null;
  fullUrl: string | null;
}

interface ListingOwner {
  id: string;
  displayName: string;
  memberSince: string;
  phone?: string | null;
}

interface ListingDetail {
  id: string;
  slug: string;
  type: string;
  title: string;
  status: string;
  description: string;
  price: number | null;
  isNegotiable: boolean;
  categoryId: string;
  categoryName: string;
  cityName: string;
  localityName: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  contactPreference: string;
  owner: ListingOwner;
  media: ListingMedia[];
  attributes: Record<string, unknown>;
  marketplace: Record<string, unknown> | null;
  publishedAt: string | null;
  expiresAt: string | null;
  viewCount: number;
  saveCount: number;
  isSaved?: boolean;
  isFeatured: boolean;
}

async function loadListing(slug: string): Promise<ListingDetail | null> {
  try {
    // Authenticated so the response carries `isSaved`; that also forces no-store, which
    // is correct — a cached page must not tell the next visitor what someone else saved.
    return await api<ListingDetail>(`/listings/${encodeURIComponent(slug)}`, { auth: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Per-listing metadata. Listing pages are the platform's entire organic search surface,
 * so title, description, canonical URL and Open Graph image are all derived from real
 * content rather than a template.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await loadListing(slug).catch(() => null);

  if (!listing) {
    return { title: 'Ad not found', robots: { index: false, follow: false } };
  }

  const place = listing.localityName
    ? `${listing.localityName}, ${listing.cityName}`
    : listing.cityName;
  const priceLabel =
    listing.price === 0 ? 'Free' : listing.price !== null ? formatPrice(listing.price) : '';

  const title = `${listing.title}${priceLabel ? ` — ${priceLabel}` : ''} in ${place}`;
  const description = listing.description.replace(/\s+/g, ' ').slice(0, 155);
  const image = listing.media.find((media) => media.cardUrl)?.cardUrl ?? undefined;

  // Anything not currently published is deindexed: a sold or expired ad in search
  // results is a bad result for the searcher and for LocZ.
  const indexable = listing.status === 'PUBLISHED';

  return {
    title,
    description,
    alternates: { canonical: `/ad/${listing.slug}` },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/ad/${listing.slug}`,
      type: 'article',
      images: image ? [{ url: image, width: 720, height: 540, alt: listing.title }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [locale, listing, user] = await Promise.all([
    getLocale(),
    loadListing(slug),
    getCurrentUser(),
  ]);

  if (!listing) notFound();

  const t = getTranslator(locale);
  const isOwner = user?.id === listing.owner.id;
  const cover = listing.media.find((media) => media.fullUrl) ?? listing.media[0];

  const similar = await apiSafe<{ items: Array<{ id: string; slug: string; title: string }> }>(
    `/search?categoryId=${listing.categoryId}&limit=6`,
    { revalidate: 300 },
  );

  // Product structured data. Google shows price and availability in results for
  // marketplace listings, which is most of LocZ's organic traffic.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title,
    description: listing.description.slice(0, 500),
    category: listing.categoryName,
    ...(cover?.fullUrl ? { image: [cover.fullUrl] } : {}),
    ...(listing.price !== null
      ? {
          offers: {
            '@type': 'Offer',
            price: listing.price,
            priceCurrency: 'INR',
            availability:
              listing.status === 'SOLD'
                ? 'https://schema.org/SoldOut'
                : 'https://schema.org/InStock',
            url: `${SITE_URL}/ad/${listing.slug}`,
            ...(listing.latitude && listing.longitude
              ? {
                  availableAtOrFrom: {
                    '@type': 'Place',
                    address: {
                      '@type': 'PostalAddress',
                      addressLocality: listing.cityName,
                      addressRegion: listing.localityName ?? undefined,
                      addressCountry: 'IN',
                    },
                    geo: {
                      '@type': 'GeoCoordinates',
                      latitude: listing.latitude,
                      longitude: listing.longitude,
                    },
                  },
                }
              : {}),
          },
        }
      : {}),
  };

  return (
    <div className="container">
      <script
        type="application/ld+json"
        // Values come from JSON.stringify of server-built data, not from raw user HTML.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">{t('nav.home')}</Link>
        <span>›</span>
        <Link href={`/search?cityId=${encodeURIComponent(listing.cityName)}`}>
          {listing.cityName}
        </Link>
        <span>›</span>
        <span>{listing.categoryName}</span>
      </nav>

      {listing.status === 'SOLD' ? (
        <div className="alert alert--info" style={{ marginTop: 16 }}>
          {t('listing.sold')}
        </div>
      ) : null}
      {listing.status === 'EXPIRED' ? (
        <div className="alert alert--info" style={{ marginTop: 16 }}>
          {t('listing.expired')}
        </div>
      ) : null}

      <div className="detail">
        <div>
          <div className="detail__gallery">
            {cover?.fullUrl ? (
              <img
                src={cover.fullUrl}
                alt={listing.title}
                width={1600}
                height={1200}
                // The cover image is the largest contentful paint on this page.
                loading="eager"
                fetchPriority="high"
              />
            ) : (
              <div
                style={{
                  aspectRatio: '4 / 3',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--locz-surface-muted)',
                  color: 'var(--locz-text-muted)',
                }}
              >
                {t('brand.name')}
              </div>
            )}

            {listing.media.length > 1 ? (
              <div className="detail__thumbs">
                {listing.media.map((media) =>
                  media.thumbUrl ? (
                    <img
                      key={media.id}
                      src={media.thumbUrl}
                      alt=""
                      loading="lazy"
                      width={64}
                      height={64}
                    />
                  ) : null,
                )}
              </div>
            ) : null}
          </div>

          <section className="panel" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.0625rem' }}>{t('listing.description')}</h2>
            <p className="detail__description">{listing.description}</p>
          </section>

          {Object.keys(listing.attributes).length > 0 ? (
            <section className="panel">
              <h2 style={{ marginTop: 0, fontSize: '1.0625rem' }}>{t('listing.details')}</h2>
              <dl className="attr-list">
                {Object.entries(listing.attributes).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replace(/_/g, ' ')}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>

        <aside>
          <div className="panel">
            <p className="detail__price">
              {listing.price === 0
                ? t('listing.free')
                : listing.price !== null
                  ? formatPrice(listing.price)
                  : ''}
              {listing.isNegotiable && listing.price ? (
                <span
                  style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--locz-text-muted)' }}
                >
                  {' '}
                  · {t('listing.negotiable')}
                </span>
              ) : null}
            </p>

            <h1 className="detail__title">{listing.title}</h1>

            <p className="detail__meta">
              {listing.localityName ? `${listing.localityName}, ` : ''}
              {listing.cityName}
              {listing.publishedAt
                ? ` · ${t('listing.postedOn', {
                    date: new Date(listing.publishedAt).toLocaleDateString('en-IN', {
                      dateStyle: 'medium',
                    }),
                  })}`
                : ''}
            </p>
            <p className="detail__meta">{t('listing.views', { count: listing.viewCount })}</p>

            {!isOwner ? (
              <div style={{ marginTop: 20, display: 'grid', gap: 8 }}>
                <ContactPanel
                  listingId={listing.id}
                  phone={listing.owner.phone ?? null}
                  isSignedIn={Boolean(user)}
                  labels={{
                    contact: t('listing.contactSeller'),
                    showPhone: t('listing.showPhone'),
                    hidden: t('listing.phoneHidden'),
                    signIn: t('nav.signIn'),
                  }}
                />
                <SaveButton
                  listingId={listing.id}
                  initialSaved={listing.isSaved ?? false}
                  isSignedIn={Boolean(user)}
                  labels={{ save: t('listing.save'), saved: t('listing.saved') }}
                />
              </div>
            ) : (
              <Link
                href="/dashboard"
                className="btn btn--outline btn--block"
                style={{ marginTop: 20 }}
              >
                {t('dashboard.action.edit')}
              </Link>
            )}
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0, fontSize: '0.9375rem' }}>{t('listing.seller')}</h2>
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{listing.owner.displayName}</p>
            <p className="detail__meta" style={{ margin: 0 }}>
              {t('listing.memberSince', {
                date: new Date(listing.owner.memberSince).toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                }),
              })}
            </p>
            <p style={{ marginTop: 16, marginBottom: 0 }}>
              <Link
                href={`/report?listing=${listing.id}`}
                style={{ color: 'var(--locz-text-muted)', fontSize: '0.8125rem' }}
              >
                {t('listing.report')}
              </Link>
            </p>
          </div>
        </aside>
      </div>

      {similar && similar.items.length > 1 ? (
        <section className="section">
          <div className="section__head">
            <h2>{t('listing.similar')}</h2>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {similar.items
              .filter((item) => item.id !== listing.id)
              .slice(0, 5)
              .map((item) => (
                <li key={item.id}>
                  <Link href={`/ad/${item.slug}`} style={{ color: 'var(--locz-primary)' }}>
                    {item.title}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
