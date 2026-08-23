'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ADS_CLIENT,
  PLACEMENTS,
  isPlacementLive,
  slotIdFor,
  type PlacementId,
} from '@/lib/ads/placements';

/**
 * One advertising position.
 *
 *   <AdSlot placement="BUSINESS_AFTER_ABOUT" contentScore={score} />
 *
 * The page names a position and says how much content it has. Everything else —
 * whether an ad renders, on which device, from which provider, how much space to
 * reserve — is decided by `placements.ts`, so monetisation can change without
 * touching a template that serves three million URLs.
 *
 * It renders nothing at all unless every gate is open. That is deliberate: this
 * ships before AdSense has approved the site, and shipping inert is what makes
 * that safe.
 */

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface Props {
  placement: PlacementId;
  /**
   * A rough measure of how much this page has to say. Used to keep a sparse
   * business page — a name and a phone number — from carrying three
   * advertisements. Never satisfied by padding, because it counts real fields.
   */
  contentScore?: number;
  className?: string;
}

export function AdSlot({ placement, contentScore = 0, className }: Props) {
  const ref = useRef<HTMLModElement>(null);
  const [pushed, setPushed] = useState(false);
  const config = PLACEMENTS[placement];
  const live = isPlacementLive(placement, contentScore);

  useEffect(() => {
    if (!live || pushed || !ref.current) return;

    const push = () => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        setPushed(true);
      } catch {
        // A failed push must never surface. An empty container is a tidy page;
        // "Ad failed" is a broken one, and the reader did not come here for ads.
      }
    };

    if (!config.lazy) {
      push();
      return;
    }

    // Below the fold: wait until it is close to being seen, so advertising is not
    // competing with the page's own content for bandwidth on a phone.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          push();
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [live, pushed, config.lazy]);

  if (!live) return null;

  const deviceClass =
    config.device === 'mobile'
      ? 'ad-slot--mobile-only'
      : config.device === 'desktop'
        ? 'ad-slot--desktop-only'
        : '';

  return (
    <aside
      className={`ad-slot ${deviceClass} ${className ?? ''}`.trim()}
      // Not part of the document's meaning. A screen reader announcing an
      // advertisement between the address and the opening hours is noise, and
      // ads must never read as LocZ content.
      aria-label="Advertisement"
      data-placement={placement}
      style={
        {
          '--ad-reserve-mobile': `${config.reserve.mobile}px`,
          '--ad-reserve-desktop': `${config.reserve.desktop}px`,
        } as React.CSSProperties
      }
    >
      <span className="ad-slot__label">Advertisement</span>
      <ins
        ref={ref}
        className="adsbygoogle ad-slot__unit"
        style={{ display: 'block' }}
        data-ad-client={ADS_CLIENT}
        data-ad-slot={slotIdFor(placement)}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
