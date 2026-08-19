'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
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
  nearYou,
  loadingLabel,
  kmLabel,
  withinKm,
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
  nearYou: string;
  loadingLabel: string;
  kmLabel: string;
  withinKm: string;
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
  }, [loading, hasMore, page, q, pincode, cityId, latitude, longitude, radiusKm]);

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

  return (
    <>
      <div className="search-businesses__grid">
        {(() => {
          let lastBand = -1;
          return items.map((business) => {
            const hasDistance = business.distanceMeters !== undefined;
            const band = hasDistance ? bandIndex(business.distanceMeters!) : -1;
            const showBand = hasDistance && band !== lastBand;
            if (showBand) lastBand = band;
            const area = business.pincode ?? business.cityName ?? nearYou;
            const place = hasDistance
              ? `${formatDistance(business.distanceMeters!, kmLabel)} · ${area}`
              : area;
            return (
              <Fragment key={business.id}>
                {showBand ? <h3 className="nearby-businesses__band">{bandLabel(band)}</h3> : null}
                <Link href={`/b/${business.slug}`} className="search-business-card">
                  <span className="search-business-card__mark" aria-hidden="true">
                    {business.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="search-business-card__body">
                    <span className="search-business-card__category">{business.categoryName}</span>
                    <strong>{business.name}</strong>
                    <span className="search-business-card__place">
                      <Icon name="location" /> {place}
                    </span>
                  </span>
                  {business.verificationStatus === 'VERIFIED' ? (
                    <span className="search-business-card__verified">
                      <Icon name="shield" /> {verifiedLabel}
                    </span>
                  ) : null}
                  <Icon name="arrow" />
                </Link>
              </Fragment>
            );
          });
        })()}
      </div>
      {loading ? (
        <p className="nearby-businesses__loading" aria-live="polite">
          {loadingLabel}
        </p>
      ) : null}
      {hasMore ? <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} /> : null}
    </>
  );
}
