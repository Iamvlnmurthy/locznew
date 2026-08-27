'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { trackOnrolBannerEvent, type OnrolBannerContext } from '@/lib/analytics';

const ONROL_PROGRAM_URL =
  'https://onrol.in/programs/afprograms?utm_source=locz&utm_medium=display&utm_campaign=ai_programs&utm_content=business_page_banner';

/**
 * Direct campaign shown in the storefront's post-location advertising position.
 * Separate desktop and mobile artwork keeps the message readable without cropping
 * the supplied poster into an illegible thumbnail.
 */
export function StorefrontHouseAd({
  businessId,
  businessName,
  city,
  category,
}: OnrolBannerContext) {
  const bannerRef = useRef<HTMLElement>(null);
  const viewTracked = useRef(false);

  useEffect(() => {
    const banner = bannerRef.current;
    if (!banner) return;

    const recordView = () => {
      if (viewTracked.current) return;
      viewTracked.current = true;
      trackOnrolBannerEvent('onrol_banner_view', {
        businessId,
        businessName,
        city,
        category,
      });
    };

    const supportsObserver = typeof window.IntersectionObserver === 'function';
    if (!supportsObserver) {
      const bounds = banner.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) recordView();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        recordView();
        observer.disconnect();
      },
      { threshold: 0.25 },
    );

    observer.observe(banner);
    return () => observer.disconnect();
  }, [businessId, businessName, category, city]);

  return (
    <aside ref={bannerRef} className="storefront-house-ad" aria-label="Sponsored learning program">
      <span className="storefront-house-ad__label">Sponsored · Onrol</span>
      <a
        href={ONROL_PROGRAM_URL}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="storefront-house-ad__link"
        onClick={() =>
          trackOnrolBannerEvent('onrol_banner_click', {
            businessId,
            businessName,
            city,
            category,
          })
        }
        aria-label="Explore the Onrol AI Generalist Program (opens in a new tab)"
      >
        <picture>
          <source
            media="(max-width: 760px)"
            srcSet="/ads/onrol-ai-generalist-storefront-mobile-v1.webp"
          />
          <Image
            src="/ads/onrol-ai-generalist-storefront-desktop-v1.webp"
            alt="Onrol AI Execution School — build your AI career with the AI Generalist Program"
            width={1800}
            height={600}
            sizes="(max-width: 760px) calc(100vw - 24px), (max-width: 1179px) calc(100vw - 48px), 1076px"
          />
        </picture>
      </a>
    </aside>
  );
}
