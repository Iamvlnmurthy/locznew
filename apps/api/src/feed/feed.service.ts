import { Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, ListingType, Prisma } from '@prisma/client';
import { Coordinates, withinRadius } from '../common/utils/geo-distance';
import { ListingSummaryDto } from '../listings/dto/listing.dto';
import { ListingsService } from '../listings/listings.service';
import { GeoRepository } from '../prisma/geo.repository';
import { PrismaService } from '../prisma/prisma.service';
import { FeedDto, FeedQueryDto, FeedSectionDto } from './dto/feed.dto';

/**
 * The location-aware home feed.
 *
 * Phase 1 recommendation is rules-based, not learned (as scoped): location, category
 * affinity from recent behaviour, freshness and popularity. Every section is built from
 * the database rather than the search index, because the home screen is the first thing
 * a user sees and must not depend on Meilisearch being up.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoRepository,
    private readonly listings: ListingsService,
  ) {}

  async getFeed(query: FeedQueryDto, viewerId?: string): Promise<FeedDto> {
    const city = await this.resolveCity(query, viewerId);
    const limit = Math.min(query.limit, 20);

    // The origin every card measures its distance from: the viewer's shared coordinates when
    // present, otherwise the centre of the city being browsed. Either way every finding gets a
    // distance — "how far" is never blank, which is the whole point of a hyperlocal feed.
    const hasGps = query.latitude !== undefined && query.longitude !== undefined;
    const origin: Coordinates = hasGps
      ? { latitude: query.latitude!, longitude: query.longitude! }
      : await this.cityCentroid(city.id);

    // Radius is a hard filter only when the viewer shared real coordinates — a radius drawn
    // around a city centroid the user never chose would hide inventory for no good reason.
    const maxMeters = hasGps && query.radiusKm ? query.radiusKm * 1000 : undefined;

    // Sections are independent, so they run concurrently — the feed is as slow as its
    // slowest section, not the sum of all of them.
    const [
      nearby,
      latestProducts,
      offers,
      jobs,
      services,
      requirements,
      recentlyViewed,
      recommended,
    ] = await Promise.all([
      this.nearbySection(query, city.id, limit, viewerId, origin),
      this.typeSection(ListingType.PRODUCT, city.id, limit, viewerId, origin),
      this.offersSection(city.id, limit, viewerId, origin),
      this.typeSection(ListingType.JOB, city.id, limit, viewerId, origin),
      this.typeSection(ListingType.SERVICE, city.id, limit, viewerId, origin),
      this.typeSection(ListingType.BUYER_REQUIREMENT, city.id, limit, viewerId, origin),
      viewerId ? this.listings.listRecentlyViewed(viewerId, limit, origin) : Promise.resolve([]),
      viewerId ? this.recommendedSection(viewerId, city.id, limit, origin) : Promise.resolve([]),
    ]);

    const sections: FeedSectionDto[] = [
      { key: 'nearby', title: 'Near you', seeAllHref: `/search?cityId=${city.id}`, items: nearby },
      { key: 'recommended', title: 'Recommended for you', items: recommended },
      {
        key: 'latest_products',
        title: 'Latest items for sale',
        seeAllHref: `/search?type=PRODUCT&cityId=${city.id}`,
        items: latestProducts,
      },
      {
        key: 'offers',
        title: 'Offers around you',
        seeAllHref: `/search?type=OFFER&cityId=${city.id}`,
        items: offers,
      },
      {
        key: 'jobs',
        title: 'Jobs near you',
        seeAllHref: `/search?type=JOB&cityId=${city.id}`,
        items: jobs,
      },
      {
        key: 'services',
        title: 'Services nearby',
        seeAllHref: `/search?type=SERVICE&cityId=${city.id}`,
        items: services,
      },
      {
        key: 'requirements',
        title: 'People looking for',
        seeAllHref: `/search?type=BUYER_REQUIREMENT&cityId=${city.id}`,
        items: requirements,
      },
      { key: 'recently_viewed', title: 'Recently viewed', items: recentlyViewed },
    ];

    // Apply the radius uniformly across every section, then drop sections left empty.
    const withinRadiusSections = sections
      .map((section) => ({ ...section, items: withinRadius(section.items, maxMeters) }))
      .filter((section) => section.items.length > 0);

    // A radius that hides everything is a dead end. Fall back to the city-wide feed and flag
    // it, so the UI offers "nothing within N km — showing nearby areas" rather than a blank
    // screen. Only relevant when a radius was actually applied.
    const radiusWidened = maxMeters !== undefined && withinRadiusSections.length === 0;
    const finalSections = radiusWidened
      ? sections.filter((section) => section.items.length > 0)
      : withinRadiusSections;

    return {
      cityId: city.id,
      cityName: city.name,
      radiusWidened,
      sections: finalSections,
    };
  }

  /**
   * City resolution order: explicit request → device coordinates → the user's default
   * saved location → the configured launch city. A visitor always gets a populated feed.
   */
  private async resolveCity(
    query: FeedQueryDto,
    viewerId?: string,
  ): Promise<{ id: string; name: string }> {
    if (query.cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: query.cityId } });
      if (city) return { id: city.id, name: city.name };
    }

    // A pincode stands in for coordinates: its centroid decides the city, and the
    // sections below then build around that point exactly as they do for a GPS fix.
    if (query.pincode && query.latitude === undefined) {
      const pincode = await this.prisma.pincode.findUnique({
        where: { code: query.pincode },
        select: { latitude: true, longitude: true, cityId: true, city: { select: { name: true } } },
      });

      if (pincode) {
        Object.assign(query, {
          latitude: Number(pincode.latitude),
          longitude: Number(pincode.longitude),
        });

        // Most of India sits outside a launched city; those codes fall through to the
        // nearest-city lookup below rather than failing.
        if (pincode.cityId && pincode.city) {
          return { id: pincode.cityId, name: pincode.city.name };
        }
      }
    }

    if (query.latitude !== undefined && query.longitude !== undefined) {
      const nearest = await this.geo.findNearestCity(query.latitude, query.longitude);
      if (nearest) return { id: nearest.id, name: nearest.name };
    }

    if (viewerId) {
      const saved = await this.prisma.savedLocation.findFirst({
        where: { userId: viewerId, isDefault: true },
        include: { city: true },
      });
      if (saved) return { id: saved.city.id, name: saved.city.name };
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'launch.defaultCitySlug' },
    });
    const slug = typeof setting?.value === 'string' ? setting.value : 'hyderabad';

    const fallback =
      (await this.prisma.city.findUnique({ where: { slug } })) ??
      (await this.prisma.city.findFirst({
        where: { isLaunched: true },
        // Nulls last, or this returns a district somewhere alphabetical. Every one of the
        // 638 places derived from the pincode dataset has a null population, and
        // PostgreSQL sorts nulls first on a descending order — so a missing
        // `feed.defaultCity` setting would land a visitor in Adilabad rather than the
        // largest city we actually serve.
        orderBy: { population: { sort: 'desc', nulls: 'last' } },
      }));

    if (!fallback) throw new NotFoundException('No launched city is configured');
    return { id: fallback.id, name: fallback.name };
  }

  /** Centre of a launched city — the origin used when the viewer shares no GPS fix. */
  private async cityCentroid(cityId: string): Promise<Coordinates> {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: { latitude: true, longitude: true },
    });
    return { latitude: Number(city?.latitude ?? 0), longitude: Number(city?.longitude ?? 0) };
  }

  private async nearbySection(
    query: FeedQueryDto,
    cityId: string,
    limit: number,
    viewerId?: string,
    origin?: Coordinates,
  ): Promise<ListingSummaryDto[]> {
    if (query.latitude === undefined || query.longitude === undefined) {
      // No coordinates shared — city-level browsing is a first-class path, not a
      // degraded one.
      return this.listings.findSummariesByIds(
        await this.recentListingIds({ cityId }, limit),
        viewerId,
        origin,
      );
    }

    // Widening radius: a sparse locality should still fill the shelf rather than show
    // "nothing near you".
    for (const radiusKm of [5, 10, 25, 50]) {
      const rows = await this.geo.findNearbyListings({
        latitude: query.latitude,
        longitude: query.longitude,
        radiusMeters: radiusKm * 1000,
        limit,
        offset: 0,
      });

      if (rows.length >= Math.min(limit, 4) || radiusKm === 50) {
        return this.listings.findSummariesByIds(
          rows.map((row) => row.id),
          viewerId,
          origin,
        );
      }
    }

    return [];
  }

  private async typeSection(
    type: ListingType,
    cityId: string,
    limit: number,
    viewerId?: string,
    origin?: Coordinates,
  ): Promise<ListingSummaryDto[]> {
    const ids = await this.recentListingIds({ cityId, type }, limit);
    return this.listings.findSummariesByIds(ids, viewerId, origin);
  }

  /** Offers are time-bound: only those valid right now belong on the home screen. */
  private async offersSection(
    cityId: string,
    limit: number,
    viewerId?: string,
    origin?: Coordinates,
  ): Promise<ListingSummaryDto[]> {
    const now = new Date();
    const listings = await this.prisma.listing.findMany({
      where: {
        type: ListingType.OFFER,
        status: ListingStatus.PUBLISHED,
        deletedAt: null,
        cityId,
        offer: { startsAt: { lte: now }, endsAt: { gte: now } },
      },
      select: { id: true },
      orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
    });

    return this.listings.findSummariesByIds(
      listings.map((listing) => listing.id),
      viewerId,
      origin,
    );
  }

  /**
   * Rules-based recommendations: the categories this user has actually engaged with,
   * weighted toward things they saved over things they merely opened. Enough signal to
   * be useful, and no model to train or explain.
   */
  private async recommendedSection(
    viewerId: string,
    cityId: string,
    limit: number,
    origin?: Coordinates,
  ): Promise<ListingSummaryDto[]> {
    const [saved, viewed] = await Promise.all([
      this.prisma.savedListing.findMany({
        where: { userId: viewerId },
        select: { listing: { select: { categoryId: true } } },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.recentlyViewed.findMany({
        where: { userId: viewerId },
        select: { listing: { select: { categoryId: true } } },
        take: 50,
        orderBy: { viewedAt: 'desc' },
      }),
    ]);

    const weights = new Map<string, number>();
    for (const entry of saved) {
      weights.set(entry.listing.categoryId, (weights.get(entry.listing.categoryId) ?? 0) + 3);
    }
    for (const entry of viewed) {
      weights.set(entry.listing.categoryId, (weights.get(entry.listing.categoryId) ?? 0) + 1);
    }

    // No history yet — the caller drops the empty section rather than showing filler.
    if (weights.size === 0) return [];

    const topCategories = [...weights.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([categoryId]) => categoryId);

    const listings = await this.prisma.listing.findMany({
      where: {
        status: ListingStatus.PUBLISHED,
        deletedAt: null,
        cityId,
        categoryId: { in: topCategories },
        // Never recommend a user their own listing, or one they have already saved.
        ownerId: { not: viewerId },
        savedBy: { none: { userId: viewerId } },
      },
      select: { id: true },
      orderBy: [{ isFeatured: 'desc' }, { viewCount: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
    });

    return this.listings.findSummariesByIds(
      listings.map((listing) => listing.id),
      viewerId,
      origin,
    );
  }

  private async recentListingIds(
    where: Prisma.ListingWhereInput,
    limit: number,
  ): Promise<string[]> {
    const listings = await this.prisma.listing.findMany({
      where: { ...where, status: ListingStatus.PUBLISHED, deletedAt: null, visibility: 'PUBLIC' },
      select: { id: true },
      orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
    });
    return listings.map((listing) => listing.id);
  }
}
