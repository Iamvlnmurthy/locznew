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

  // Deliberately not the category banner.
  //
  // Those are drawn as dark, low-key backgrounds for white text to sit on, at
  // 1200x400. Shrunk into an 88px square they read as a dark smudge with a letter
  // floating on it, whichever part you crop to - the artwork has nothing legible
  // at that size because it was never meant to carry meaning on its own.
  //
  // A category without a purpose-built square icon therefore falls through to the
  // monogram tile below, which is legible at 88px, differs per business, and does
  // not pretend to be a photograph of the place.

  return {
    src: premiumCategoryArtwork({ name: categoryName }),
    kind: 'icon',
  };
}
