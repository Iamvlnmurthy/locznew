'use client';

import { useEffect } from 'react';
import { trackBusinessAction, type BusinessAction } from '@/lib/analytics';

/**
 * Counts the business actions on a storefront, without making the storefront a
 * client component.
 *
 * One delegated listener rather than an onClick on every link. The alternative -
 * converting Call, Directions, Website, Email, Enquire, Claim and Share into
 * client components - would move critical, server-rendered content behind
 * hydration on three million pages to gain nothing a listener cannot do.
 *
 * The anchors stay plain server-rendered <a> elements carrying `data-track`.
 * If this component never mounts, they still work; they are links, not handlers.
 */
export function BusinessActionTracker({
  businessId,
  category,
  city,
  locality,
}: {
  businessId: string;
  category: string;
  city: string;
  locality?: string | null;
}) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const el = target?.closest?.('[data-track]');
      if (!el) return;
      const action = el.getAttribute('data-track') as BusinessAction | null;
      if (!action) return;
      trackBusinessAction(action, { businessId, category, city, locality });
    };
    // Capture phase, so a click still counts if something downstream stops it.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [businessId, category, city, locality]);

  return null;
}
