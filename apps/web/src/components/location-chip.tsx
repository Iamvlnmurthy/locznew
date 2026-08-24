'use client';

import Link from 'next/link';
import { Icon } from './icons';

/**
 * Shows the active city and links to the picker. A visitor with no city set sees
 * "Change" rather than an empty chip — city-level browsing is the default path, and the
 * chip must invite the choice rather than look broken.
 */
export function LocationChip({
  cityName,
  citySlug,
  cityTier,
  changeLabel,
  exploreLabel,
}: {
  cityName: string | null;
  citySlug?: string | null;
  cityTier?: 1 | 2 | 3;
  changeLabel: string;
  exploreLabel?: string;
}) {
  const hasGuide = Boolean(citySlug && (cityTier === 1 || cityTier === 2));

  if (hasGuide) {
    return (
      <div className="location-chip location-chip--guide">
        <Link
          href={`/in/${citySlug}`}
          className="location-chip__city"
          title={exploreLabel ?? cityName ?? changeLabel}
          aria-label={exploreLabel ?? cityName ?? changeLabel}
        >
          <Icon name="location" width="15" height="15" />
          <span>{cityName}</span>
        </Link>
        <Link href="/location" className="location-chip__change" aria-label={changeLabel}>
          <span className="location-chip__chevron" aria-hidden="true">
            ⌄
          </span>
        </Link>
      </div>
    );
  }

  return (
    <Link
      href="/location"
      className="location-chip"
      title={cityName ?? changeLabel}
      aria-label={`${cityName ?? changeLabel} — ${changeLabel}`}
    >
      <Icon name="location" width="15" height="15" />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {cityName ?? changeLabel}
      </span>
      <span className="location-chip__chevron" aria-hidden="true">
        ⌄
      </span>
    </Link>
  );
}
