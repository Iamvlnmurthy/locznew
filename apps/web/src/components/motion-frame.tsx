'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Keeps navigation motion deliberately small: the page content settles into place while
 * the persistent header and mobile dock stay anchored. The scroll flag is shared by the
 * sticky navigation surfaces so depth only appears when it communicates position.
 */
export function MotionFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const update = () => {
      frame = 0;
      root.toggleAttribute('data-page-scrolled', window.scrollY > 12);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      root.removeAttribute('data-page-scrolled');
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const selector = [
      '.home-popular-card',
      '.home-status-rail > *',
      '.home-content-shell > .local-news',
      '.home-content-shell > .home-main-column > *',
      '.home-content-shell > .local-jobs',
      '.listing-card',
      '.search-business-card',
      '.business-profile-cover',
      '.business-profile-identity',
      '.business-profile-tabs',
      '.business-profile-section',
      '.business-profile-contact > *',
      '.home-intent',
    ].join(',');
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

    root.dataset.motionReady = 'true';
    elements.forEach((element, index) => {
      element.dataset.motionReveal = 'true';
      element.style.setProperty('--locz-reveal-delay', `${Math.min(index % 6, 5) * 45}ms`);
    });

    if (reduced || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-motion-visible'));
      return () => {
        delete root.dataset.motionReady;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-motion-visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -7% 0px' },
    );
    elements.forEach((element) => observer.observe(element));

    const hero = document.querySelector<HTMLElement>('.home-hero--discovery');
    let pointerFrame = 0;
    const applyPointer = (event: PointerEvent) => {
      if (!hero || event.pointerType === 'touch') return;
      const bounds = hero.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        hero.style.setProperty('--locz-hero-x', x.toFixed(3));
        hero.style.setProperty('--locz-hero-y', y.toFixed(3));
      });
    };
    const resetPointer = () => {
      hero?.style.setProperty('--locz-hero-x', '0');
      hero?.style.setProperty('--locz-hero-y', '0');
    };
    hero?.addEventListener('pointermove', applyPointer, { passive: true });
    hero?.addEventListener('pointerleave', resetPointer);

    return () => {
      observer.disconnect();
      hero?.removeEventListener('pointermove', applyPointer);
      hero?.removeEventListener('pointerleave', resetPointer);
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      delete root.dataset.motionReady;
    };
  }, [pathname]);

  return (
    <main id="main" className="locz-route-frame" key={pathname}>
      {children}
    </main>
  );
}
