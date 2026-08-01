import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, SITE_URL, api, apiSafe } from '@/lib/api';
import { getMessageGroup, getTranslator, type Translator } from '@/i18n';
import { getCurrentUser, getLocale } from '@/lib/session';
import { formatPrice, ListingCard } from '@/components/listing-card';
import { Icon } from '@/components/icons';
import type { ListingSummary } from '@locz/shared-types';
import { SaveButton } from './save-button';
import { ContactPanel } from './contact-panel';
import { ListingGallery } from './listing-gallery';
import { ShareButton, WhatsAppShareButton } from './share-button';

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
  const [listing, locale] = await Promise.all([loadListing(slug).catch(() => null), getLocale()]);
  const t = getTranslator(locale);

  if (!listing) {
    return {
      title: t('listing.metadataNotFound'),
      robots: { index: false, follow: false },
    };
  }

  const place = listing.localityName
    ? `${listing.localityName}, ${listing.cityName}`
    : listing.cityName;
  const priceLabel =
    listing.price === 0
      ? t('listing.free')
      : listing.price !== null
        ? formatPrice(listing.price)
        : '';

  const title = t('listing.metadataTitle', {
    title: listing.title,
    price: priceLabel ? ` — ${priceLabel}` : '',
    place,
  });
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
  const labels = getMessageGroup(locale, 'listing');
  const isOwner = user?.id === listing.owner.id;
  const cover = listing.media.find((media) => media.fullUrl) ?? listing.media[0];

  const similar = await apiSafe<{ items: ListingSummary[] }>(
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

      <nav className="breadcrumbs" aria-label={t('listing.breadcrumb')}>
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

      <div className="detail detail--flagship">
        <div>
          <ListingGallery
            media={listing.media}
            title={listing.title}
            brandName={t('brand.name')}
            labels={labels}
          />

          <section className="panel detail__section">
            <span className="section-kicker">{t('listing.aboutKicker')}</span>
            <h2>{t('listing.description')}</h2>
            <p className="detail__description">{listing.description}</p>
          </section>

          {Object.keys({ ...listing.marketplace, ...listing.attributes }).length > 0 ? (
            <section className="panel detail__section">
              <span className="section-kicker">{t('listing.glanceKicker')}</span>
              <h2>{t('listing.details')}</h2>
              <dl className="attr-list">
                {Object.entries({ ...listing.marketplace, ...listing.attributes })
                  .filter(([, value]) => value !== null && value !== false && value !== '')
                  .slice(0, 10)
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{humaniseKey(key)}</dt>
                      <dd>{humaniseValue(value, t)}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          ) : null}

          <section className="panel detail__location-card">
            <span className="detail__location-icon">
              <Icon name="location" />
            </span>
            <div>
              <span className="section-kicker">{t('listing.meetNearby')}</span>
              <h2>
                {listing.localityName ? `${listing.localityName}, ` : ''}
                {listing.cityName}
              </h2>
              <p>{t('listing.locationPrivacy')}</p>
            </div>
            <Link href="/safety">
              {t('listing.planSafeMeetup')} <Icon name="arrow" />
            </Link>
          </section>

          <section className="detail__trust-strip" aria-label={t('listing.safetyAria')}>
            <div>
              <Icon name="location" />
              <span>
                <strong>{t('listing.meetLocally')}</strong>
                {t('listing.publicPlace')}
              </span>
            </div>
            <div>
              <Icon name="shield" />
              <span>
                <strong>{t('listing.stayProtected')}</strong>
                {t('listing.keepChatInside')}
              </span>
            </div>
            <div>
              <Icon name="heart" />
              <span>
                <strong>{t('listing.trustInstinct')}</strong>
                {t('listing.neverPayAdvance')}
              </span>
            </div>
          </section>
        </div>

        <aside className="detail__aside">
          <div className="panel detail__summary">
            <span className="detail__type">{humaniseKey(listing.type)}</span>
            <p className="detail__price">
              {listing.price === 0
                ? t('listing.free')
                : listing.price !== null
                  ? formatPrice(listing.price)
                  : ''}
              {listing.isNegotiable && listing.price ? (
                <span className="detail__negotiable">· {t('listing.negotiable')}</span>
              ) : null}
            </p>

            <h1 className="detail__title">{listing.title}</h1>

            <p className="detail__meta">
              {listing.localityName ? `${listing.localityName}, ` : ''}
              {listing.cityName}
              {listing.publishedAt
                ? ` · ${t('listing.postedOn', {
                    date: new Date(listing.publishedAt).toLocaleDateString(`${locale}-IN`, {
                      dateStyle: 'medium',
                    }),
                  })}`
                : ''}
            </p>
            <p className="detail__meta detail__meta--views">
              <Icon name="chart" />
              {t('listing.views', { count: listing.viewCount })}
            </p>

            <div className="detail__signals">
              <span>
                <Icon name="heart" /> {t('listing.savedCount', { count: listing.saveCount })}
              </span>
              <span>
                <Icon name="shield" /> {t('listing.moderated')}
              </span>
            </div>

            {!isOwner ? (
              <div className="detail__actions" id="contact-seller">
                <ContactPanel
                  listingId={listing.id}
                  listingSlug={listing.slug}
                  sellerName={listing.owner.displayName}
                  phone={listing.owner.phone ?? null}
                  isSignedIn={Boolean(user)}
                  labels={{ ...labels, signIn: t('nav.signIn') }}
                />
                <div className="detail__secondary-actions">
                  <SaveButton
                    listingId={listing.id}
                    initialSaved={listing.isSaved ?? false}
                    isSignedIn={Boolean(user)}
                    labels={labels}
                  />
                  <ShareButton
                    title={listing.title}
                    url={`${SITE_URL}/ad/${listing.slug}`}
                    labels={labels}
                  />
                  <WhatsAppShareButton
                    title={listing.title}
                    url={`${SITE_URL}/ad/${listing.slug}`}
                    labels={labels}
                  />
                </div>
                <p className="detail__action-note">
                  <Icon name="shield" />
                  {t('listing.actionSafety')}
                </p>
              </div>
            ) : (
              <div className="detail__owner-actions">
                <Link href="/dashboard?tab=listings" className="btn btn--primary btn--block">
                  {t('listing.manage')}
                </Link>
                <ShareButton
                  title={listing.title}
                  url={`${SITE_URL}/ad/${listing.slug}`}
                  labels={labels}
                />
                <WhatsAppShareButton
                  title={listing.title}
                  url={`${SITE_URL}/ad/${listing.slug}`}
                  labels={labels}
                />
              </div>
            )}
          </div>

          <div className="panel detail__seller">
            <span className="detail__avatar" aria-hidden="true">
              {listing.owner.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <span className="detail__seller-label">{t('listing.seller')}</span>
              <p>
                <Link href={`/seller/${listing.owner.id}`}>{listing.owner.displayName}</Link>
              </p>
              <p className="detail__meta">
                {t('listing.memberSince', {
                  date: new Date(listing.owner.memberSince).toLocaleDateString(`${locale}-IN`, {
                    month: 'long',
                    year: 'numeric',
                  }),
                })}
              </p>
            </div>
            <div className="detail__seller-trust">
              <span>
                <Icon name="check" /> {t('listing.phoneVerified')}
              </span>
              <span>
                <Icon name="message" /> {t('listing.contactThrough')}
              </span>
            </div>
            <Link href={`/report?listing=${listing.id}`} className="detail__report">
              {t('listing.report')}
            </Link>
          </div>
        </aside>
      </div>

      {similar && similar.items.length > 1 ? (
        <section className="section">
          <div className="section__head">
            <div>
              <span className="section-kicker">{t('listing.exploreKicker')}</span>
              <h2>{t('listing.similar')}</h2>
            </div>
          </div>
          <div className="card-rail">
            {similar.items
              .filter((item) => item.id !== listing.id)
              .slice(0, 5)
              .map((item) => (
                <ListingCard key={item.id} listing={item} t={t} />
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function humaniseKey(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function humaniseValue(value: unknown, t: Translator): string {
  if (typeof value === 'boolean') return t(value ? 'listing.yes' : 'listing.no');
  if (Array.isArray(value)) return value.join(', ');
  return String(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
