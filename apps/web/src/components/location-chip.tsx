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
  changeLabel,
}: {
  cityName: string | null;
  changeLabel: string;
}) {
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
