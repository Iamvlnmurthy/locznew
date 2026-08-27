'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ADS_CLIENT,
  ADS_PROVIDER,
  PLACEMENTS,
  isPlacementLive,
  slotIdFor,
  type AdFormat,
  type PlacementId,
} from '@/lib/ads/placements';
import { AdsterraBanner, AdsterraNative } from './adsterra-banner';

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

const FORMAT_ATTRIBUTES: Readonly<Record<AdFormat, Readonly<Record<string, string>>>> = {
  display: {
    'data-ad-format': 'auto',
    'data-full-width-responsive': 'true',
  },
  'in-feed': {
    'data-ad-format': 'fluid',
    'data-ad-layout-key': '-6t+ed+2i-1n-4w',
  },
  'in-article': {
    'data-ad-format': 'fluid',
    'data-ad-layout': 'in-article',
  },
  multiplex: {
    'data-ad-format': 'autorelaxed',
  },
};

export function AdSlot({ placement, contentScore = 0, className }: Props) {
  const config = PLACEMENTS[placement];
  const live = isPlacementLive(placement, contentScore);
  const containerRef = useRef<HTMLElement>(null);
  const unitRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);
  const [adState, setAdState] = useState<'idle' | 'requesting' | 'filled' | 'unfilled'>(
    config.lazy ? 'idle' : 'requesting',
  );

  useEffect(() => {
    if (!live || !unitRef.current || !containerRef.current) return;

    const unit = unitRef.current;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const readStatus = () => {
      const status = unit.dataset.adStatus;
      if (status === 'filled') {
        setAdState('filled');
        if (settleTimer) clearTimeout(settleTimer);
      } else if (status?.startsWith('unfill')) {
        setAdState('unfilled');
        if (settleTimer) clearTimeout(settleTimer);
      }
    };

    const statusObserver = new MutationObserver(readStatus);
    statusObserver.observe(unit, {
      attributes: true,
      attributeFilter: ['data-ad-status'],
    });
    readStatus();

    const push = () => {
      if (pushedRef.current) return;
      pushedRef.current = true;
      setAdState('requesting');

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        setAdState('unfilled');
        return;
      }

      // A blocker or interrupted provider script may never write data-ad-status.
      // Do not let that leave a permanent blank floor in the document.
      settleTimer = setTimeout(() => {
        setAdState((current) => (current === 'requesting' ? 'unfilled' : current));
      }, 8000);
    };

    if (!config.lazy) {
      push();
      return () => {
        statusObserver.disconnect();
        if (settleTimer) clearTimeout(settleTimer);
      };
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
    io.observe(containerRef.current);
    return () => {
      io.disconnect();
      statusObserver.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [live, config.lazy]);

  if (!live) return null;

  if (ADS_PROVIDER === 'adsterra') {
    if (config.format === 'in-feed') {
      return <AdsterraNative className={className} />;
    }
    const adsterraFormat =
      config.format === 'in-article'
        ? 'rectangle-300x250'
        : config.format === 'display'
          ? 'leaderboard-728x90'
          : 'responsive';
    return <AdsterraBanner format={adsterraFormat} className={className} />;
  }

  const deviceClass =
    config.device === 'mobile'
      ? 'ad-slot--mobile-only'
      : config.device === 'desktop'
        ? 'ad-slot--desktop-only'
        : '';

  return (
    <aside
      ref={containerRef}
      className={`ad-slot ad-slot--${config.format} ${deviceClass} ${className ?? ''}`.trim()}
      // Not part of the document's meaning. A screen reader announcing an
      // advertisement between the address and the opening hours is noise, and
      // ads must never read as LocZ content.
      aria-label="Advertisement"
      aria-hidden={adState === 'unfilled' ? true : undefined}
      data-ad-state={adState}
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
        ref={unitRef}
        className="adsbygoogle ad-slot__unit"
        style={{ display: 'block' }}
        data-ad-client={ADS_CLIENT}
        data-ad-slot={slotIdFor(placement)}
        {...FORMAT_ATTRIBUTES[config.format]}
      />
    </aside>
  );
}
