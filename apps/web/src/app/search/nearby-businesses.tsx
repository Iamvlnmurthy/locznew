'use client';

import Image from 'next/image';
import { publicBrandLogo } from '@locz/public-brands';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { businessListingArtwork } from '@/lib/business-listing-artwork';
import { loadNearbyBusinesses, type NearbyBusiness } from './businesses-actions';

/**
 * "Businesses near you" — infinite scroll, 20 at a time, scoped to the viewer's pincode.
 * Appends the next page as the sentinel enters view (never a bulk load), calling the server
 * action so the httpOnly session cookie reaches the API.
 */
function formatDistance(meters: number, kmLabel: string): string {
  const km = meters / 1000;
  return km < 1 ? `${Math.round(meters)} m` : `${km.toFixed(km < 10 ? 1 : 0)} ${kmLabel}`;
}

// OLX-style progressive bands: nearest first, then widen. A header appears as the list crosses
// each threshold, so a sparse locality reads "Nearby · more within 5 km" instead of a wall.
const BAND_METRES = [1000, 3000, 5000, 10000, 25000];
function bandIndex(meters: number): number {
  for (let i = 0; i < BAND_METRES.length; i += 1) if (meters < BAND_METRES[i]) return i;
  return BAND_METRES.length;
}

/**
 * A Google Maps directions link to the place — exact coordinates when the record has them,
 * otherwise a name+city query Maps can resolve. Opens the Maps app on mobile, a new tab on
 * desktop; `api=1` is the documented, key-free deep-link form.
 */
function directionsHref(business: NearbyBusiness): string {
  const destination =
    business.latitude !== null &&
    business.latitude !== undefined &&
    business.longitude !== null &&
    business.longitude !== undefined
      ? `${business.latitude},${business.longitude}`
      : encodeURIComponent([business.name, business.cityName].filter(Boolean).join(', '));
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function NearbyBusinesses({
  q,
  pincode,
  cityId,
  latitude,
  longitude,
  radiusKm,
  initial,
  initialHasMore,
  verifiedLabel,
  claimLabel,
  directionsLabel,
  viewProfileLabel,
  listingsLabel,
  nearYou,
  loadingLabel,
  kmLabel,
  withinKm,
  areaOptions = [],
  allCategoriesLabel,
  verifiedOnlyLabel,
  emptyLabel,
}: {
  q?: string;
  pincode?: string;
  cityId?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  initial: NearbyBusiness[];
  initialHasMore: boolean;
  verifiedLabel: string;
  claimLabel: string;
  directionsLabel: string;
  viewProfileLabel: string;
  listingsLabel: string;
  nearYou: string;
  loadingLabel: string;
  kmLabel: string;
  withinKm: string;
  areaOptions?: Array<{ key: string; label: string }>;
  allCategoriesLabel: string;
  verifiedOnlyLabel: string;
  emptyLabel: string;
}) {
  const bandLabel = (index: number): string =>
    index === 0
      ? nearYou
      : withinKm.replace(
          '{km}',
          String((index < BAND_METRES.length ? BAND_METRES[index] : 25000) / 1000),
        );
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [area, setArea] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const next = await loadNearbyBusinesses({
        q,
        pincode,
        cityId,
        latitude,
        longitude,
        radiusKm,
        area: area || undefined,
        verifiedOnly: verifiedOnly || undefined,
        page: page + 1,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        return [...prev, ...next.items.filter((b) => !seen.has(b.id))];
      });
      setPage(next.page);
      setHasMore(next.hasNextPage);
    } finally {
      setLoading(false);
    }
  }, [
    loading,
    hasMore,
    page,
    q,
    pincode,
    cityId,
    latitude,
    longitude,
    radiusKm,
    area,
    verifiedOnly,
  ]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // Re-fetch page 1 from scratch when a filter changes. The initial (unfiltered) page comes from
  // the server, so this effect skips its first run and only reacts to a user changing a filter.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadNearbyBusinesses({
      q,
      pincode,
      cityId,
      latitude,
      longitude,
      radiusKm,
      area: area || undefined,
      verifiedOnly: verifiedOnly || undefined,
      page: 1,
    })
      .then((fresh) => {
        if (cancelled) return;
        setItems(fresh.items);
        setPage(1);
        setHasMore(fresh.hasNextPage);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only filter changes drive a reset; scope inputs (q/pincode/…) are fixed per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, verifiedOnly]);

  return (
    <>
      {areaOptions.length > 0 ? (
        <div className="business-filters" role="group" aria-label={allCategoriesLabel}>
          <label className="business-filters__category">
            <Icon name="sliders" />
            <select
              value={area}
              onChange={(event) => setArea(event.target.value)}
              aria-label={allCategoriesLabel}
            >
              <option value="">{allCategoriesLabel}</option>
              {areaOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`business-filters__toggle${verifiedOnly ? ' is-active' : ''}`}
            aria-pressed={verifiedOnly}
            onClick={() => setVerifiedOnly((value) => !value)}
          >
            <Icon name="shield" /> {verifiedOnlyLabel}
          </button>
        </div>
      ) : null}
      <div className="search-businesses__grid">
        {(() => {
          return items.map((business, index) => {
            const hasDistance = business.distanceMeters !== undefined;
            const band = hasDistance ? bandIndex(business.distanceMeters!) : -1;
            const previousDistance = index > 0 ? items[index - 1]?.distanceMeters : undefined;
            const previousBand = previousDistance === undefined ? -1 : bandIndex(previousDistance);
            const showBand = hasDistance && band !== previousBand;
            // Distance already says "near you"; the repeated pincode is just noise, so show it
            // only when there's no distance to show.
            const distance = hasDistance ? formatDistance(business.distanceMeters!, kmLabel) : null;
            const place =
              [business.addressLine, business.cityName].filter(Boolean).join(', ') ||
              business.pincode ||
              nearYou;
            const businessLogo =
              business.logoUrl ?? publicBrandLogo(business.name, business.publicBrandKey);
            const fallbackArtwork = businessListingArtwork(business.name, business.categoryName);
            return (
              <Fragment key={business.id}>
                {showBand ? <h3 className="nearby-businesses__band">{bandLabel(band)}</h3> : null}
                <article className="search-business-card">
                  {/* Stretched link: covers the whole tile so it opens the profile, while the
                      Directions button below sits above it (z-index) as a separate action. */}
                  <Link
                    href={`/b/${business.slug}`}
                    className="search-business-card__link"
                    aria-label={business.name}
                  />
                  <div className="search-business-card__visual" aria-hidden="true">
                    {businessLogo ? (
                      <Image
                        className="search-business-card__logo"
                        src={businessLogo}
                        alt=""
                        width={112}
                        height={112}
                        sizes="(max-width: 640px) 88px, 112px"
                      />
                    ) : (
                      <>
                        <Image
                          className={`search-business-card__art search-business-card__art--${fallbackArtwork.kind}`}
                          src={fallbackArtwork.src}
                          alt=""
                          width={88}
                          height={88}
                          sizes="(max-width: 640px) 88px, 112px"
                        />
                        <span className="search-business-card__monogram">
                          {business.name.trim().charAt(0).toUpperCase()}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="search-business-card__content">
                    <div className="search-business-card__head">
                      <span className="search-business-card__category">
                        {business.categoryName}
                      </span>
                      {business.verificationStatus === 'VERIFIED' ? (
                        <span className="search-business-card__verified">
                          <Icon name="shield" /> {verifiedLabel}
                        </span>
                      ) : business.claimStatus === 'UNCLAIMED' && business.isClaimable !== false ? (
                        <span className="search-business-card__claim">{claimLabel}</span>
                      ) : null}
                    </div>
                    <strong className="search-business-card__name">{business.name}</strong>
                    <span className="search-business-card__place">
                      <Icon name="location" /> {place}
                    </span>
                    <div className="search-business-card__meta">
                      {distance ? (
                        <span>
                          <Icon name="navigation" /> {distance}
                        </span>
                      ) : null}
                      {business.listingCount ? (
                        <span>
                          <Icon name="tag" />{' '}
                          {listingsLabel.replace('{count}', String(business.listingCount))}
                        </span>
                      ) : null}
                    </div>
                    <div className="search-business-card__actions">
                      <span className="search-business-card__profile">
                        {viewProfileLabel} <Icon name="arrow" />
                      </span>
                      <a
                        href={directionsHref(business)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="search-business-card__directions"
                      >
                        <Icon name="navigation" /> {directionsLabel}
                      </a>
                    </div>
                  </div>
                </article>
              </Fragment>
            );
          });
        })()}
      </div>
      {!loading && items.length === 0 ? (
        <p className="nearby-businesses__empty" aria-live="polite">
          {emptyLabel}
        </p>
      ) : null}
      {loading ? (
        <p className="nearby-businesses__loading" aria-live="polite">
          {loadingLabel}
        </p>
      ) : null}
      {hasMore ? <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} /> : null}
    </>
  );
}
