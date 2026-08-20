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
  'ayurveda & herbal': banner('ayurveda-herbal'),
  'bakeries & sweets': banner('bakeries-sweets-v5'),
  'beauty & cosmetics': banner('beauty-cosmetics'),
  'beauty & wellness': beauty,
  'bike repair': automobile,
  'books, stationery & office': banner('books-stationery'),
  'car repair': automobile,
  'cleaning services': banner('cleaning-services'),
  'clothing stores': banner('clothing-stores'),
  colleges: education,
  'computer & laptop stores': banner('computer-laptop-stores'),
  'cooking oil & ghee': banner('cooking-oil-ghee'),
  'courier & parcel': banner('courier-parcel'),
  'dairy, bakery & eggs': banner('dairy-bakery-eggs'),
  'dry fruits & nuts': banner('dry-fruits-nuts'),
  'education & training': education,
  'electrical services': banner('electrical-services'),
  'electrical stores': banner('electrical-services'),
  'electronics stores': banner('electronics-stores'),
  'event services': banner('event-services'),
  'ev charging stations': banner('ev-charging-stations'),
  'footwear stores': banner('footwear-stores'),
  'furniture stores': banner('furniture-stores'),
  'fruits & vegetables': banner('fruits-vegetables'),
  'gift stores': banner('gift-stores'),
  'groceries & provisions': banner('groceries-provisions'),
  'grocery & kirana': banner('grocery-kirana'),
  'hardware stores': banner('hardware-stores'),
  'health & personal care': banner('health-personal-care'),
  'home & kitchen': banner('home-kitchen'),
  'home services': banner('home-services'),
  'hospitals & clinics': banner('hospitals-clinics'),
  'hotels & stays': banner('hotels-stays'),
  'jewellery stores': banner('jewellery-stores'),
  'local manufacturers': banner('local-manufacturers'),
  'meat, fish & poultry': banner('meat-fish-poultry'),
  'medical stores & pharmacies': banner('medical-pharmacies'),
  'medicines & pharmacy': banner('medicines-pharmacy'),
  'mobile stores': banner('mobile-stores'),
  'pet stores & services': banner('pet-services'),
  'petrol stations': banner('petrol-pumps'),
  'plumbing services': banner('plumbing-services'),
  'printing & stationery': banner('printing-stationery'),
  'professional services': banner('professional-services'),
  'property services': banner('property-services'),
  'repair services': banner('repair-services'),
  'rice & grains': banner('rice-grains'),
  'restaurants & food': banner('restaurants-food'),
  'salons & spas': beauty,
  schools: education,
  'snacks & namkeen': banner('snacks-namkeen'),
  'spices & masalas': banner('spices-masalas'),
  'sports, fitness & outdoors': banner('sports-fitness-outdoors'),
  'tailoring & boutiques': banner('tailoring-services'),
  'tea, coffee & beverages': banner('tea-coffee-beverages'),
  'toys, baby & kids': banner('toys-baby-kids'),
  'travel services': banner('travel-transport'),
  'tuition & coaching': education,
  'tyre & battery stores': automobile,
  'wholesale businesses': banner('wholesale-distribution'),
};

export function premiumCategoryBanner(name?: string | null): PremiumCategoryBanner | null {
  return name ? (categoryBanners[name.trim().toLowerCase()] ?? null) : null;
}
