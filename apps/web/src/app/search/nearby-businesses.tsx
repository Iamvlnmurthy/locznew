'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { loadNearbyBusinesses, type NearbyBusiness } from './businesses-actions';

/**
 * "Businesses near you" — infinite scroll, 20 at a time, scoped to the viewer's pincode.
 * Appends the next page as the sentinel enters view (never a bulk load), calling the server
 * action so the httpOnly session cookie reaches the API.
 */
export function NearbyBusinesses({
  q,
  pincode,
  cityId,
  initial,
  initialHasMore,
  verifiedLabel,
  nearYou,
  loadingLabel,
}: {
  q?: string;
  pincode?: string;
  cityId?: string;
  initial: NearbyBusiness[];
  initialHasMore: boolean;
  verifiedLabel: string;
  nearYou: string;
  loadingLabel: string;
}) {
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const next = await loadNearbyBusinesses({ q, pincode, cityId, page: page + 1 });
      setItems((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        return [...prev, ...next.items.filter((b) => !seen.has(b.id))];
      });
      setPage(next.page);
      setHasMore(next.hasNextPage);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, q, pincode, cityId]);

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
        {items.map((business) => {
          const place = business.pincode ?? business.cityName ?? nearYou;
          return (
            <Link key={business.id} href={`/b/${business.slug}`} className="search-business-card">
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
          );
        })}
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
