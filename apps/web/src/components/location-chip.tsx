'use client';

import Link from 'next/link';

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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
      </svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {cityName ?? changeLabel}
      </span>
    </Link>
  );
}
