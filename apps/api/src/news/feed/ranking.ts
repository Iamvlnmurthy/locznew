/**
 * News feed ranking — the "distance-ring + freshness" ordering from the News Product plan.
 *
 * A viewer in Gachibowli sees their locality first, then nearby localities, then city → district →
 * state → India, newest-first within each ring, with a 7-day recency window. Emergencies override.
 * Facets (topic/scope/date) are filters over the same set. Pure and testable; the DB layer feeds it
 * rows and PostGIS supplies distanceKm.
 */
import { haversineKm } from './event-shaper';

export type CoverageScope = 'local' | 'city' | 'district' | 'state' | 'india';

export interface RankableEvent {
  id: string;
  category: string;
  publishedAt: string | null; // ISO
  latitude: number | null;
  longitude: number | null;
  /** Broadest scope the event applies to, when it has no precise point (city/district/state/india). */
  scope?: CoverageScope;
  severity?: number; // 0..100 — emergencies are high
  trustScore?: number; // 0..100
  isEmergency?: boolean;
}

export interface Viewer {
  lat: number;
  lng: number;
}

export interface FeedFacets {
  /** topic filter, e.g. 'sports' | 'politics' | 'weather' … */
  category?: string;
  /** cap the widest ring shown: 'local' = only nearby, 'india' = everything. */
  scope?: CoverageScope;
  /** ISO date bounds (the archive/date facet). */
  after?: string;
  before?: string;
  /** only high-signal events (the "top news" facet). */
  topOnly?: boolean;
}

/** Ring index (0 = closest). Lower is nearer/more relevant. */
export const RINGS: Array<{ ring: number; label: CoverageScope | 'nearby'; maxKm: number }> = [
  { ring: 0, label: 'local', maxKm: 5 },
  { ring: 1, label: 'nearby', maxKm: 10 },
  { ring: 2, label: 'nearby', maxKm: 25 },
  { ring: 3, label: 'city', maxKm: 60 },
  { ring: 4, label: 'district', maxKm: 150 },
  { ring: 5, label: 'state', maxKm: 600 },
  { ring: 6, label: 'india', maxKm: Infinity },
];
const SCOPE_RING: Record<CoverageScope, number> = {
  local: 0,
  city: 3,
  district: 4,
  state: 5,
  india: 6,
};

export interface RankedEvent extends RankableEvent {
  distanceKm: number | null;
  ring: number;
  score: number;
}

const RECENCY_WINDOW_DAYS = 7;

function ringForDistance(km: number): number {
  for (const r of RINGS) if (km <= r.maxKm) return r.ring;
  return RINGS[RINGS.length - 1]!.ring;
}

/** Ring from a precise point if present, else from the event's declared scope, else widest. */
export function ringOf(
  e: RankableEvent,
  viewer: Viewer,
): { ring: number; distanceKm: number | null } {
  if (e.latitude != null && e.longitude != null) {
    const km = haversineKm(viewer.lat, viewer.lng, e.latitude, e.longitude);
    return { ring: ringForDistance(km), distanceKm: Math.round(km * 10) / 10 };
  }
  return { ring: e.scope ? SCOPE_RING[e.scope] : SCOPE_RING.india, distanceKm: null };
}

function ageHours(publishedAt: string | null, now: number): number {
  if (!publishedAt) return RECENCY_WINDOW_DAYS * 24;
  const t = Date.parse(publishedAt);
  return Number.isNaN(t) ? RECENCY_WINDOW_DAYS * 24 : Math.max(0, (now - t) / 3_600_000);
}

/**
 * Score = ring dominates (hyperlocal-first), freshness breaks ties within a ring, severity/trust
 * nudge, and an emergency is lifted above everything. Higher is better.
 */
export function scoreEvent(e: RankableEvent, ring: number, now: number): number {
  const ringScore = (RINGS.length - ring) * 1000; // ring is the primary axis
  const hrs = ageHours(e.publishedAt, now);
  const freshness = Math.max(0, 200 - hrs); // ~8 days to decay to 0, newest ≈ 200
  const quality = (e.severity ?? 0) * 0.5 + (e.trustScore ?? 0) * 0.3;
  const emergency = e.isEmergency ? 100_000 : 0;
  return emergency + ringScore + freshness + quality;
}

/**
 * Rank + filter events for a viewer. `nowMs` is injected (no ambient clock) so it is deterministic.
 * Applies the recency window, the facets, then sorts by score. Returns ordered RankedEvents.
 */
export function rankFeed(
  events: RankableEvent[],
  viewer: Viewer,
  facets: FeedFacets,
  nowMs: number,
): RankedEvent[] {
  const windowStart = nowMs - RECENCY_WINDOW_DAYS * 24 * 3_600_000;
  const after = facets.after ? Date.parse(facets.after) : windowStart;
  const before = facets.before ? Date.parse(facets.before) : nowMs;
  const maxRing = facets.scope ? (SCOPE_RING[facets.scope] ?? 6) : 6;

  const out: RankedEvent[] = [];
  for (const e of events) {
    if (facets.category && e.category !== facets.category) continue;
    if (
      facets.topOnly &&
      !(e.isEmergency || (e.trustScore ?? 0) >= 70 || (e.severity ?? 0) >= 60)
    ) {
      continue;
    }
    const t = e.publishedAt ? Date.parse(e.publishedAt) : nowMs;
    if (!Number.isNaN(t) && (t < after || t > before)) continue;

    const { ring, distanceKm } = ringOf(e, viewer);
    if (ring > maxRing) continue;

    out.push({ ...e, ring, distanceKm, score: scoreEvent(e, ring, nowMs) });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Cursor-style page: slice after `offset`, plus whether more remain (for infinite scroll). */
export function paginate<T>(
  items: T[],
  offset: number,
  limit: number,
): { page: T[]; hasMore: boolean } {
  const page = items.slice(offset, offset + limit);
  return { page, hasMore: offset + limit < items.length };
}
