import { Injectable } from '@nestjs/common';
import { GeoRepository } from '../../prisma/geo.repository';
import { NewsRefineService } from '../refine/news-refine.service';
import { cleanText, stripPublisherSuffix } from './event-shaper';
import {
  type CoverageScope,
  dedupeRanked,
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
  /** How many source articles collapsed into this card (1 = single report). */
  sources: number;
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
      title: r.title,
    }));

    const facets: FeedFacets = {
      category: q.category,
      scope: q.scope,
      after: q.after,
      before: q.before,
      topOnly: q.topOnly,
    };
    const ranked = rankFeed(events, { lat: q.latitude, lng: q.longitude }, facets, nowMs);
    // Collapse the many-publishers-one-story duplicates before paginating, so a page isn't filled
    // with the same event. sourceCount rides along for a "N reports" hint on the card.
    const deduped = dedupeRanked(ranked);

    // Paginate, then refine ONLY this page (lazy + cached) into the viewer's language — most events
    // are never viewed, so we never pay to refine them.
    const { page, hasMore } = paginate(deduped, offset, limit);
    const lang = q.lang ?? 'en';
    const byId = new Map(rows.map((r) => [r.id, r]));

    const cards = await Promise.all(
      page.map(async (e): Promise<FeedCard> => {
        const row = byId.get(e.id)!;
        const sourceText = `${row.title}\n${row.summary ?? ''}`.trim();
        const refined = await this.refine.refine(e.id, lang, sourceText);
        // Refined text is already clean; the raw fallback needs entity/publisher tidy-up.
        const title = refined?.title ?? cleanText(stripPublisherSuffix(row.title)) ?? row.title;
        const summary = refined?.summary ?? cleanText(row.summary);
        return {
          slug: row.slug,
          title,
          summary,
          category: e.category,
          distanceKm: e.distanceKm,
          ring: e.ring,
          publishedAt: e.publishedAt,
          locz: !!refined,
          sources: e.sourceCount ?? 1,
        };
      }),
    );

    return { cards, hasMore };
  }
}
