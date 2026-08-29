'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';

/**
 * Momentum smooth-scrolling for the desktop wheel via Lenis, plus a hard scroll-to-top on every
 * route change. Two deliberate choices:
 *  - Touch scrolling is left NATIVE (Lenis `smoothTouch` defaults off): hijacking touch feels worse
 *    on the budget Android phones that make up most of LocZ's traffic.
 *  - Users who prefer reduced motion get no Lenis at all — plain native scrolling.
 * The scroll-to-top effect also fixes pages that used to load at the footer (autoFocus inputs below
 * the fold, and the old global `scroll-behavior: smooth` fighting the App Router's scroll reset).
 */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({ smoothWheel: true, duration: 1.05 });
    (window as typeof window & { __lenis?: Lenis }).__lenis = lenis;

    let raf = requestAnimationFrame(function loop(time) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      delete (window as typeof window & { __lenis?: Lenis }).__lenis;
    };
  }, []);

  useEffect(() => {
    const lenis = (window as typeof window & { __lenis?: Lenis }).__lenis;
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
