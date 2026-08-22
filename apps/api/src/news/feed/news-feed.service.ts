import { Injectable } from '@nestjs/common';
import { GeoRepository } from '../../prisma/geo.repository';
import {
  type CoverageScope,
  type FeedFacets,
  paginate,
  rankFeed,
  type RankableEvent,
} from './ranking';

export interface FeedQuery {
  latitude: number;
  longitude: number;
  category?: string;
  scope?: CoverageScope;
  after?: string;
  before?: string;
  topOnly?: boolean;
  offset?: number;
  limit?: number;
}

export interface FeedCard {
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  distanceKm: number | null;
  ring: number;
  publishedAt: string | null;
}

/** How wide to search the DB per requested scope (rankFeed then orders into rings within it). */
const SCOPE_RADIUS_M: Record<CoverageScope, number> = {
  local: 25_000,
  city: 60_000,
  district: 150_000,
  state: 600_000,
  india: 3_000_000,
};

/**
 * The public hyperlocal news feed: pull events near the viewer from PostGIS, then apply the pure
 * ring + freshness + facet ranking. Refinement (LocZ summary in the viewer's language) is layered
 * on top lazily; this returns the persisted event summary until then.
 */
@Injectable()
export class NewsFeedService {
  constructor(private readonly geo: GeoRepository) {}

  async getFeed(
    q: FeedQuery,
    nowMs = Date.now(),
  ): Promise<{ cards: FeedCard[]; hasMore: boolean }> {
    const scope: CoverageScope = q.scope ?? 'city';
    const radius = SCOPE_RADIUS_M[scope];
    const since = new Date(q.after ? Date.parse(q.after) : nowMs - 7 * 24 * 3_600_000);
    const limit = Math.min(q.limit ?? 20, 50);
    const offset = q.offset ?? 0;

    // Over-fetch so ranking + facets + pagination have material to work with.
    const rows = await this.geo.findNearbyNewsEvents(q.latitude, q.longitude, radius, since, 300);

    const events: RankableEvent[] = rows.map((r) => ({
      id: r.id,
      category: r.categories[0] ?? 'local',
      publishedAt: r.latestUpdateAt.toISOString(),
      latitude: r.latitude == null ? null : Number(r.latitude),
      longitude: r.longitude == null ? null : Number(r.longitude),
      severity: r.severity,
      trustScore: r.trustScore,
    }));

    const facets: FeedFacets = {
      category: q.category,
      scope: q.scope,
      after: q.after,
      before: q.before,
      topOnly: q.topOnly,
    };
    const ranked = rankFeed(events, { lat: q.latitude, lng: q.longitude }, facets, nowMs);

    // Map ranking output back onto the row fields for the card, preserving order.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const cards: FeedCard[] = ranked.map((e) => {
      const row = byId.get(e.id)!;
      return {
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        category: e.category,
        distanceKm: e.distanceKm,
        ring: e.ring,
        publishedAt: e.publishedAt,
      };
    });

    const { page, hasMore } = paginate(cards, offset, limit);
    return { cards: page, hasMore };
  }
}
