/**
 * Resolve place names mentioned in an article to coordinates + a confidence score.
 *
 * This is the cheap end of the resolution ladder (dictionary + alias match) from
 * docs/NEWS_INTELLIGENCE_ARCHITECTURE.md §8; NER and an LLM tie-breaker slot in above it later.
 * Pure and gazetteer-injected so it is unit-testable and so production can back the gazetteer
 * with the City/Locality/LocationAlias tables while tests/demo use an in-memory seed.
 */

export type PlaceEntityType = 'STATE' | 'DISTRICT' | 'CITY' | 'LOCALITY';

export interface PlaceEntry {
  entityId: string;
  entityType: PlaceEntityType;
  /** Canonical display name. */
  name: string;
  /** Every alias/native spelling that should resolve here (Madhapur, మాదాపూర్, …). */
  aliases: string[];
  lat: number;
  lng: number;
  /** Broader is less specific: a locality outranks the city it sits in for hyperlocal news. */
  cityId?: string;
}

export interface ResolvedPlace {
  entityId: string;
  entityType: PlaceEntityType;
  name: string;
  lat: number;
  lng: number;
  /** 0..100. Locality hits score higher than city/state; a lone ambiguous hit scores low. */
  confidence: number;
}

export interface Gazetteer {
  /** All entries whose name/alias appears (word-boundary) in the given lower-cased text. */
  match(text: string): PlaceEntry[];
}

const SPECIFICITY: Record<PlaceEntityType, number> = {
  LOCALITY: 100,
  CITY: 70,
  DISTRICT: 55,
  STATE: 40,
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Case/space-folded word-boundary containment, safe for non-Latin scripts (Telugu/Hindi). */
export function mentions(text: string, term: string): boolean {
  const t = normalize(text);
  const q = normalize(term);
  if (!q) return false;
  // For ASCII terms use a word boundary so "car" ≠ "carefully"; for non-ASCII fall back to
  // substring (JS \b is Latin-only and would never fire on Telugu).
  if (/^[\x00-\x7f]+$/.test(q)) {
    return new RegExp(
      `(^|[^\\p{L}])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`,
      'u',
    ).test(t);
  }
  return t.includes(q);
}

/**
 * An in-memory gazetteer over a fixed list — used by the demo and tests. Production supplies a
 * DB-backed implementation of the same interface.
 */
export class InMemoryGazetteer implements Gazetteer {
  constructor(private readonly entries: PlaceEntry[]) {}

  match(text: string): PlaceEntry[] {
    return this.entries.filter((e) => [e.name, ...e.aliases].some((n) => mentions(text, n)));
  }
}

/**
 * Resolve the places an article is about. Confidence rises with specificity and with corroborating
 * co-mentions (a locality named alongside its own city is more certain); a single ambiguous hit is
 * capped low so low-confidence news pins at city/district level, never a wrong neighbourhood.
 */
export function resolvePlaces(text: string, gazetteer: Gazetteer): ResolvedPlace[] {
  const hits = gazetteer.match(text);
  if (hits.length === 0) return [];

  const cityIdsPresent = new Set(
    hits.filter((h) => h.entityType === 'CITY').map((h) => h.entityId),
  );

  return hits
    .map((h) => {
      let confidence = SPECIFICITY[h.entityType];
      // A locality corroborated by its parent city appearing in the same text is more certain.
      if (h.entityType === 'LOCALITY' && h.cityId && cityIdsPresent.has(h.cityId)) {
        confidence = Math.min(100, confidence);
      } else if (h.entityType === 'LOCALITY' && hits.length === 1) {
        // Lone locality with no corroboration: still usable but not maximal.
        confidence = 80;
      }
      return {
        entityId: h.entityId,
        entityType: h.entityType,
        name: h.name,
        lat: h.lat,
        lng: h.lng,
        confidence,
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

/** The single best place for an article (highest confidence, most specific), or null. */
export function primaryPlace(resolved: ResolvedPlace[]): ResolvedPlace | null {
  return resolved[0] ?? null;
}
