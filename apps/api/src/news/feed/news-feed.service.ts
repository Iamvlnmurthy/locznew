import { Injectable } from '@nestjs/common';
import { GeoRepository } from '../../prisma/geo.repository';
import { NewsRefineService } from '../refine/news-refine.service';
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
  lang?: string;
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
  /** true when the title/summary are LocZ's own regenerated content (not the raw source). */
  locz: boolean;
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
  constructor(
    private readonly geo: GeoRepository,
    private readonly refine: NewsRefineService,
  ) {}

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

    // Paginate the ranked events, then refine ONLY this page (lazy + cached) into the viewer's
    // language — most events are never viewed, so we never pay to refine them.
    const { page, hasMore } = paginate(ranked, offset, limit);
    const lang = q.lang ?? 'en';
    const byId = new Map(rows.map((r) => [r.id, r]));

    const cards = await Promise.all(
      page.map(async (e): Promise<FeedCard> => {
        const row = byId.get(e.id)!;
        const sourceText = `${row.title}\n${row.summary ?? ''}`.trim();
        const refined = await this.refine.refine(e.id, lang, sourceText);
        return {
          slug: row.slug,
          title: refined?.title ?? row.title,
          summary: refined?.summary ?? row.summary,
          category: e.category,
          distanceKm: e.distanceKm,
          ring: e.ring,
          publishedAt: e.publishedAt,
          locz: !!refined,
        };
      }),
    );

    return { cards, hasMore };
  }
}
