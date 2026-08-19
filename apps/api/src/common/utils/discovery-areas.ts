/**
 * The LocZ discovery areas and the mapping from a top-level catalog category name to one of them.
 *
 * Businesses are imported under their own taxonomy ("Professional services", "Bakeries & sweets")
 * which is distinct from the curated marketplace category tree, so both the "Around you" area
 * counts and the business area filter classify by the *root category name* rather than by id.
 * Regex on the name keeps it robust to exact slugs and to new leaf categories. Order matters:
 * specific buckets before generic ones.
 */
export const DISCOVERY_AREAS = [
  'food',
  'health',
  'services',
  'shopping',
  'mobility',
  'home',
  'jobs',
  'events',
  'rentals',
  'deals',
  'businesses',
  'play',
  'pets',
] as const;

export type DiscoveryArea = (typeof DISCOVERY_AREAS)[number];

export function categoryNameToArea(name: string): DiscoveryArea | null {
  const value = name.toLowerCase();
  if (/grocer|fruit|vegetable|dairy|bakery|meat|fish|poultry|food/.test(value)) return 'food';
  if (/health|beauty|cosmetic|personal care|pharma|medical|clinic/.test(value)) return 'health';
  if (/vehicle|auto|car|bike|motor/.test(value)) return 'mobility';
  if (/sport|fitness|outdoor|gym/.test(value)) return 'play';
  if (/\bpet/.test(value)) return 'pets';
  if (/job|recruit|career|hiring/.test(value)) return 'jobs';
  if (/event|wedding/.test(value)) return 'events';
  if (/real estate|rental|property/.test(value)) return 'rentals';
  if (/offer|deal/.test(value)) return 'deals';
  if (/hardware|tool|building|farm|garden|agricultur|industrial|business suppl/.test(value))
    return 'home';
  if (
    /electronic|clothing|footwear|furniture|kitchen|toys|book|station|musical|hobby|religious|festive/.test(
      value,
    )
  )
    return 'shopping';
  if (/service/.test(value)) return 'services';
  if (/business/.test(value)) return 'businesses';
  return null;
}

export function isDiscoveryArea(value: string): value is DiscoveryArea {
  return (DISCOVERY_AREAS as readonly string[]).includes(value);
}
