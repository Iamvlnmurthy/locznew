import { Injectable, Logger } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { SearchQueryDto, SearchResultDto } from '../search/dto/search.dto';
import { ListingsService } from './listings.service';
import { ListingSearchQueryDto } from './dto/listing.dto';

/**
 * Keyword search. Meilisearch ranks and filters; PostgreSQL supplies the rows.
 *
 * Hydrating from the database rather than rendering the search document means the
 * response can never show a price or title that the index has not caught up with, and
 * that one mapping serves both search and browse.
 */
@Injectable()
export class SearchQueryService {
  private readonly logger = new Logger(SearchQueryService.name);

  constructor(
    private readonly meili: SearchService,
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
  ) {}

  async search(query: SearchQueryDto, viewerId?: string): Promise<SearchResultDto> {
    // A pincode is resolved once, here, so both the keyword path and the browse path
    // see the same coordinates and return the same area.
    query = await this.resolvePincode(query);

    // With no keyword there is nothing for a search engine to do better than the
    // database — structured browse goes straight to Postgres, indexes and all.
    if (!query.q?.trim()) {
      const result = await this.listings.search(this.toBrowseQuery(query), viewerId);
      return {
        items: result.items,
        total: result.meta.total,
        page: result.meta.page,
        limit: result.meta.limit,
        usedSearchIndex: false,
      };
    }

    try {
      const { ids, total } = await this.meili.searchListings({
        query: query.q,
        filters: this.buildFilters(query),
        sort: this.buildSort(query),
        latitude: query.latitude,
        longitude: query.longitude,
        radiusKm: query.radiusKm,
        page: query.page,
        limit: query.limit,
      });

      if (ids.length === 0) {
        return { items: [], total, page: query.page, limit: query.limit, usedSearchIndex: true };
      }

      const items = await this.hydrate(ids, viewerId);
      return { items, total, page: query.page, limit: query.limit, usedSearchIndex: true };
    } catch (error) {
      // Search being down degrades quality, not availability: fall back to the database
      // rather than returning an error to someone trying to buy a fridge.
      this.logger.error(
        `Meilisearch query failed, falling back to the database: ${error instanceof Error ? error.message : String(error)}`,
      );

      const result = await this.listings.search(this.toBrowseQuery(query, true), viewerId);
      return {
        items: result.items,
        total: result.meta.total,
        page: result.meta.page,
        limit: result.meta.limit,
        usedSearchIndex: false,
      };
    }
  }

  /**
   * Turns a pincode into coordinates plus a radius.
   *
   * Radius rather than an exact code match: someone in 500081 will happily cross the
   * street into 500084, and an exact match would leave most of the country looking at an
   * empty page. Explicit coordinates win — those came from the device and are better.
   */
  private async resolvePincode(query: SearchQueryDto): Promise<SearchQueryDto> {
    if (!query.pincode || query.latitude !== undefined) return query;

    const centre = await this.prisma.pincode.findUnique({
      where: { code: query.pincode },
      select: { latitude: true, longitude: true },
    });

    // An unknown code is not an error: the other filters still describe a valid search,
    // and failing the whole request over one field would be worse than ignoring it.
    if (!centre) {
      this.logger.debug(`Ignoring unknown pincode ${query.pincode}`);
      return query;
    }

    return Object.assign(new SearchQueryDto(), query, {
      latitude: Number(centre.latitude),
      longitude: Number(centre.longitude),
      radiusKm: query.radiusKm ?? 10,
    });
  }

  /**
   * Reloads the ranked ids from Postgres and restores Meilisearch's ordering — an
   * `IN (...)` query returns rows in whatever order the planner likes, which would
   * throw away the ranking entirely.
   */
  private async hydrate(ids: string[], viewerId?: string) {
    const summaries = await this.listings.findSummariesByIds(ids, viewerId);

    const byId = new Map(summaries.map((item) => [item.id, item]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    // Any id the database could not confirm as published is dropped: the index was
    // simply ahead of reality for a moment.
    if (ordered.length !== ids.length) {
      this.logger.debug(`${ids.length - ordered.length} indexed listing(s) no longer visible`);
    }

    return ordered;
  }

  private buildFilters(query: SearchQueryDto): string[] {
    const filters: string[] = [];

    if (query.type) filters.push(`type = "${query.type}"`);
    if (query.cityId) filters.push(`cityId = "${query.cityId}"`);
    if (query.localityId) filters.push(`localityId = "${query.localityId}"`);
    if (query.businessId) filters.push(`businessId = "${query.businessId}"`);
    if (query.categoryId) {
      filters.push(`(categoryId = "${query.categoryId}" OR subcategoryId = "${query.categoryId}")`);
    }
    if (query.condition) filters.push(`condition = "${query.condition}"`);
    if (query.verifiedOnly) filters.push('isVerifiedBusiness = true');
    if (query.priceMin !== undefined) filters.push(`price >= ${query.priceMin}`);
    if (query.priceMax !== undefined) filters.push(`price <= ${query.priceMax}`);
    if (query.postedWithinDays) {
      const since = Date.now() - query.postedWithinDays * 24 * 60 * 60 * 1000;
      filters.push(`publishedAtTimestamp >= ${since}`);
    }

    return filters;
  }

  private buildSort(query: SearchQueryDto): string[] | undefined {
    switch (query.sort) {
      case 'newest':
        return ['publishedAtTimestamp:desc'];
      case 'price_asc':
        return ['price:asc'];
      case 'price_desc':
        return ['price:desc'];
      case 'popular':
        return ['viewCount:desc'];
      case 'distance':
        return query.latitude !== undefined && query.longitude !== undefined
          ? [`_geoPoint(${query.latitude}, ${query.longitude}):asc`]
          : undefined;
      case 'relevance':
      default:
        return undefined; // Meilisearch's own ranking rules
    }
  }

  private toBrowseQuery(query: SearchQueryDto, keywordFallback = false): ListingSearchQueryDto {
    const browse = new ListingSearchQueryDto();
    Object.assign(browse, {
      page: query.page,
      limit: query.limit,
      type: query.type,
      categoryId: query.categoryId,
      cityId: query.cityId,
      localityId: query.localityId,
      businessId: query.businessId,
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radiusKm,
      pincode: query.pincode,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      condition: query.condition,
      verifiedOnly: query.verifiedOnly,
      postedWithinDays: query.postedWithinDays,
      // 'relevance' has no meaning without a keyword, and it must not become 'newest'
      // either: an explicit "newest" is the user's choice, while no choice at all is what
      // lets featured listings surface first. Leaving it undefined keeps that distinction.
      sort: query.sort === 'relevance' ? undefined : query.sort,
      // Only the fallback carries the keyword. A browse request has no keyword to begin
      // with, and passing one here when the index is healthy would apply the database's
      // narrower matching on top of Meilisearch's, hiding results it correctly found.
      ...(keywordFallback && query.q?.trim() ? { q: query.q.trim() } : {}),
    });

    return browse;
  }

  /**
   * Drift check for the admin dashboard: how many published listings are missing from
   * the index. Non-zero is not an emergency — it is what the reindex button is for.
   */
  async indexStatus(): Promise<{
    available: boolean;
    indexedDocuments?: number;
    publishedListings: number;
    drift: number;
  }> {
    const [health, publishedListings] = await Promise.all([
      this.meili.health(),
      this.prisma.listing.count({
        where: { status: ListingStatus.PUBLISHED, deletedAt: null, visibility: 'PUBLIC' },
      }),
    ]);

    const drift =
      health.documents !== undefined
        ? Math.abs(publishedListings - health.documents)
        : publishedListings;
    return {
      available: health.available,
      indexedDocuments: health.documents,
      publishedListings,
      drift,
    };
  }
}
