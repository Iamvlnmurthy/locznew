/**
 * Confidence that two place records describe the same real-world entity (plan Part 8).
 * Pure and explainable — a weighted blend of name similarity, proximity and phone match — so
 * the ingestion pipeline can auto-merge only high-confidence pairs and send the rest to an
 * admin review queue. No ML, no opaque scoring.
 */
import { distanceMetres } from '../common/utils/geo-distance';

export interface DedupeCandidate {
  name: string;
  latitude: number | null;
  longitude: number | null;
  phone?: string | null;
}

/** Last ten digits, so +91 / 0 prefixes agree. */
function normalisePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? digits : null;
}

function normaliseName(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/** Jaccard token overlap of two names — cheap, order-independent, good enough for place names. */
function nameSimilarity(a: string, b: string): number {
  const sa = new Set(normaliseName(a));
  const sb = new Set(normaliseName(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const token of sa) if (sb.has(token)) intersection += 1;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Proximity score: 1 at 0 m, ~0 beyond 250 m — same shop rarely sits further apart across sources. */
function proximityScore(a: DedupeCandidate, b: DedupeCandidate): number {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return 0;
  }
  const metres = distanceMetres(
    { latitude: a.latitude, longitude: a.longitude },
    { latitude: b.latitude, longitude: b.longitude },
  );
  return Math.max(0, 1 - metres / 250);
}

/**
 * Overall confidence in [0,1]. An exact phone match is decisive; otherwise name + proximity
 * carry it. Thresholds (auto-merge vs review) are the caller's to tune per plan Part 8.
 */
export function dedupeConfidence(a: DedupeCandidate, b: DedupeCandidate): number {
  const phoneA = normalisePhone(a.phone);
  const phoneB = normalisePhone(b.phone);
  const phoneMatch = phoneA !== null && phoneA === phoneB;

  const name = nameSimilarity(a.name, b.name);
  const proximity = proximityScore(a, b);

  // A shared phone number plus any name agreement is almost certainly the same place.
  if (phoneMatch) return Math.min(1, 0.8 + 0.2 * name);

  // Otherwise lean on name and proximity together; either alone is weak.
  return Math.min(1, 0.6 * name + 0.4 * proximity);
}
