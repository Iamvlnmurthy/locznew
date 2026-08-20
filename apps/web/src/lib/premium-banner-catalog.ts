export type PremiumCategoryBanner = Readonly<{
  desktop: string;
  mobile: string;
}>;

function banner(slug: string): PremiumCategoryBanner {
  return {
    desktop: `/banners/categories/${slug}-desktop.webp`,
    mobile: `/banners/categories/${slug}-mobile.webp`,
  };
}

const automobile = banner('automobile-services-v2');
const beauty = banner('beauty-wellness-v2');
const education = banner('education-training');

const categoryBanners: Readonly<Record<string, PremiumCategoryBanner>> = {
  'automobile services': automobile,
  'bakeries & sweets': banner('bakeries-sweets-v5'),
  'beauty & wellness': beauty,
  'bike repair': automobile,
  'car repair': automobile,
  colleges: education,
  'courier & parcel': banner('courier-parcel'),
  'education & training': education,
  'electrical services': banner('electrical-services'),
  'electrical stores': banner('electrical-services'),
  'electronics stores': banner('electronics-stores'),
  'event services': banner('event-services'),
  'footwear stores': banner('footwear-stores'),
  'furniture stores': banner('furniture-stores'),
  'gift stores': banner('gift-stores'),
  'grocery & kirana': banner('grocery-kirana'),
  'hardware stores': banner('hardware-stores'),
  'home services': banner('home-services'),
  'hospitals & clinics': banner('hospitals-clinics'),
  'hotels & stays': banner('hotels-stays'),
  'jewellery stores': banner('jewellery-stores'),
  'local manufacturers': banner('local-manufacturers'),
  'salons & spas': beauty,
  schools: education,
  'tuition & coaching': education,
  'tyre & battery stores': automobile,
};

export function premiumCategoryBanner(name?: string | null): PremiumCategoryBanner | null {
  return name ? (categoryBanners[name.trim().toLowerCase()] ?? null) : null;
}
