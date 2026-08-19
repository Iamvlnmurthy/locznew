const categoryBanners: Readonly<Record<string, string>> = {
  'bakeries & sweets': '/banners/categories/bakeries-sweets-v2.png',
};

export function premiumCategoryBanner(name?: string | null): string | null {
  return name ? (categoryBanners[name.trim().toLowerCase()] ?? null) : null;
}
