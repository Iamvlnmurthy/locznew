'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Kept in sync with RADIUS_COOKIE in lib/api.ts (that module is server-only, so the name
// is repeated here rather than imported into the client bundle).
const RADIUS_COOKIE = 'locz_radius';

/**
 * The global "how far around me" control. Writing the cookie and calling router.refresh()
 * re-runs the server component, which reads the new radius and refetches the feed — so the
 * whole page reflects the chosen radius without a client-side data layer.
 */
export function RadiusSelector({
  options,
  selected,
  label,
  kmLabel,
}: {
  options: number[];
  selected: number;
  label: string;
  kmLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(km: number) {
    if (km === selected) return;
    document.cookie = `${RADIUS_COOKIE}=${km}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="radius-selector" role="group" aria-label={label}>
      <span className="radius-selector__label">{label}</span>
      <div className="radius-selector__options">
        {options.map((km) => (
          <button
            key={km}
            type="button"
            className="radius-chip"
            data-active={km === selected}
            aria-pressed={km === selected}
            disabled={pending}
            onClick={() => choose(km)}
          >
            {km} {kmLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
