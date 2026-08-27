import Image from 'next/image';

const ONROL_PROGRAM_URL = 'https://onrol.in/programs/afprograms';

/**
 * Direct campaign shown in the storefront's post-location advertising position.
 * Separate desktop and mobile artwork keeps the message readable without cropping
 * the supplied poster into an illegible thumbnail.
 */
export function StorefrontHouseAd() {
  return (
    <aside className="storefront-house-ad" aria-label="Sponsored learning program">
      <span className="storefront-house-ad__label">Sponsored · Onrol</span>
      <a
        href={ONROL_PROGRAM_URL}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="storefront-house-ad__link"
        data-track="onrol_ai_generalist_ad_click"
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
