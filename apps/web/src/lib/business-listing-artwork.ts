import { premiumBusinessBanner } from '@/lib/premium-banner-catalog';
import { premiumCategoryArtwork, premiumCategoryNameToSlug } from '@/lib/premium-icon-catalog';

export type BusinessListingArtwork = Readonly<{
  src: string;
  kind: 'icon' | 'banner';
}>;

/**
 * Keep the purpose-built square icon when one exists. For newer directory categories, use the
 * approved mobile banner instead of collapsing every no-logo business onto the same storefront.
 */
export function businessListingArtwork(
  businessName: string,
  categoryName: string,
): BusinessListingArtwork {
  const normalizedCategory = categoryName.trim().toLowerCase();
  const iconSlug = premiumCategoryNameToSlug[normalizedCategory];
  if (iconSlug) {
    return {
      src: premiumCategoryArtwork({ slug: iconSlug }),
      kind: 'icon',
    };
  }

  const banner = premiumBusinessBanner(businessName, categoryName);
  if (banner) return { src: banner.mobile, kind: 'banner' };

  return {
    src: premiumCategoryArtwork({ name: categoryName }),
    kind: 'icon',
  };
}
