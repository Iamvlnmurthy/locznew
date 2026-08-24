'use client';

import { useEffect } from 'react';

/**
 * Fire-and-forget read counter. Runs once on mount so we count actual opens (not prefetch/bots),
 * which feeds the "popular" news sort. Failures are ignored — a missed count must never surface.
 */
export function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!base || !slug) return;
    fetch(`${base}/news/stories/${encodeURIComponent(slug)}/view`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => {});
  }, [slug]);
  return null;
}
