/**
 * Maps raw OpenStreetMap tags to LocZ's own canonical category slugs. Pure and data-driven so
 * it is unit-testable and the OSM taxonomy never leaks into the LocZ UX (plan: "never expose
 * raw OSM taxonomy directly"). Unknown tags return null → the record is kept but uncategorised
 * for admin review rather than mis-filed.
 */

type OsmTags = Record<string, string | undefined>;

// amenity/shop/leisure value -> LocZ canonical slug. Extend as coverage grows.
const AMENITY: Record<string, string> = {
  restaurant: 'food',
  cafe: 'food',
  fast_food: 'food',
  bakery: 'food',
  bar: 'food',
  food_court: 'food',
  hospital: 'health',
  clinic: 'health',
  doctors: 'health',
  dentist: 'health',
  pharmacy: 'health',
  veterinary: 'pets',
  school: 'learning',
  college: 'learning',
  university: 'learning',
  library: 'learning',
  fuel: 'mobility',
  charging_station: 'mobility',
  parking: 'mobility',
  car_wash: 'mobility',
  car_repair: 'mobility',
  bank: 'services',
  atm: 'services',
  police: 'emergency',
  fire_station: 'emergency',
  gym: 'play',
  cinema: 'entertainment',
  theatre: 'entertainment',
  marketplace: 'shopping',
};

const LEISURE: Record<string, string> = {
  fitness_centre: 'play',
  sports_centre: 'play',
  pitch: 'play',
  stadium: 'play',
  swimming_pool: 'play',
  park: 'play',
};

export function osmToCategorySlug(tags: OsmTags): string | null {
  if (tags.shop) return 'shopping';
  const amenity = tags.amenity ? AMENITY[tags.amenity] : undefined;
  if (amenity) return amenity;
  const leisure = tags.leisure ? LEISURE[tags.leisure] : undefined;
  if (leisure) return leisure;
  if (tags.healthcare) return 'health';
  if (tags.office) return 'services';
  if (tags.craft) return 'services';
  return null;
}
