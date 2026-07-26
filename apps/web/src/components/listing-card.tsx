import Link from 'next/link';
import type { ListingSummary } from '@locz/shared-types';
import type { Translator } from '@/i18n';
import { Icon } from './icons';

/** Indian digit grouping: ₹1,20,000 rather than ₹120,000. */
export function formatPrice(price: number): string {
  return `₹${price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatDistance(meters: number, t: Translator): string {
  const km = meters / 1000;
  const value =
    km < 1 ? `${Math.round(meters)} m` : `${km.toFixed(km < 10 ? 1 : 0)} ${t('common.km')}`;
  return t('common.away', { distance: value });
}

export function ListingCard({
  listing,
  t,
  variant = 'standard',
}: {
  listing: ListingSummary;
  t: Translator;
  variant?: 'standard' | 'wide';
}) {
  const isFree = listing.price === 0;
  const isSold = listing.status === 'SOLD';

  return (
    <Link
      href={`/ad/${listing.slug}`}
      className={`listing-card${variant === 'wide' ? ' listing-card--wide' : ''}`}
    >
      <div className="listing-card__media">
        {listing.thumbUrl ? (
          // Plain <img> rather than next/image: listing photos come from R2 with a
          // cache-immutable header and are already resized by the media pipeline, so the
          // optimiser would add cost without adding value.
          <img
            src={listing.thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            width={320}
            height={240}
          />
        ) : (
          <div className="listing-card__placeholder">{t('brand.name')}</div>
        )}

        {listing.isFeatured ? (
          <span className="badge badge--featured" style={{ position: 'absolute', top: 8, left: 8 }}>
            <span aria-hidden="true">★</span> {t('searchUi.featured')}
          </span>
        ) : null}
        {isSold ? (
          <span className="badge badge--sold" style={{ position: 'absolute', top: 8, right: 8 }}>
            {t('dashboard.status.SOLD')}
          </span>
        ) : null}
        <span className="listing-card__save" aria-hidden="true">
          <Icon name="heart" width="17" height="17" />
        </span>
      </div>

      <div className="listing-card__body">
        {listing.price !== null ? (
          <span className={`listing-card__price${isFree ? ' listing-card__price--free' : ''}`}>
            {isFree ? t('listing.free') : formatPrice(listing.price)}
            {listing.isNegotiable && !isFree ? (
              <span
                style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--locz-text-muted)' }}
              >
                {' '}
                · {t('listing.negotiable')}
              </span>
            ) : null}
          </span>
        ) : null}

        {/* React escapes this; the card CSS clamps it to two lines so a long
            user-written title cannot break the grid. */}
        <p className="listing-card__title">{listing.title}</p>

        <div className="listing-card__meta">
          <span className="listing-card__place">
            <Icon name="location" width="12" height="12" />
            {listing.localityName ?? listing.cityName}
          </span>
          {listing.distanceMeters !== undefined ? (
            <span>{formatDistance(listing.distanceMeters, t)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
