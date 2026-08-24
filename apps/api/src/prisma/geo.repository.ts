import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface NearbyListingRow {
  id: string;
  distanceMeters: number;
}

export interface NearbySearchFilters {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  types?: string[];
  categoryIds?: string[];
  cityId?: string;
  localityId?: string;
  businessId?: string;
  priceMin?: number;
  priceMax?: number;
  condition?: string;
  verifiedOnly?: boolean;
  publishedAfter?: Date;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'distance';
}

export interface NearbySearchParams extends NearbySearchFilters {
  limit: number;
  offset: number;
}

export interface NearbyCityRow {
  id: string;
  name: string;
  slug: string;
  distanceMeters: number;
}

/**
 * The only place in the codebase that writes PostGIS SQL (ADR-0003).
 *
 * Everything here is parameterised through Prisma's tagged templates — values are
 * bound, never interpolated, so a hostile city name or radius cannot alter the query.
 * The one dynamically-assembled fragment (the optional type/category filters) is built
 * from `Prisma.sql` fragments with bound parameters, not string concatenation.
 */
@Injectable()
export class GeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Published listings within `radiusMeters`, nearest first.
   *
   * Returns ids plus distance rather than full rows: the caller re-hydrates through
   * Prisma so relations, soft-delete rules and field selection stay in one place.
   * ST_DWithin on a geography column uses the GiST index; the `<->` ordering operator
   * gives an index-assisted nearest-neighbour sort.
   */
  async findNearbyListings(params: NearbySearchParams): Promise<NearbyListingRow[]> {
    const { latitude, longitude, limit, offset } = params;

    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;
    const where = this.nearbyWhere(params, point);
    const order = this.nearbyOrder(params.sort, point);

    return this.prisma.$queryRaw<NearbyListingRow[]>`
      SELECT l."id",
             ST_Distance(l."geo", ${point}) AS "distanceMeters"
      FROM "listings" l
      LEFT JOIN "marketplace_details" md ON md."listingId" = l."id"
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  /**
   * Counts the same filtered relation that findNearbyListings pages through. Keeping the
   * predicate shared prevents a one-item page from claiming that eleven results exist.
   */
  async countNearbyListings(params: NearbySearchFilters): Promise<number> {
    const { latitude, longitude } = params;
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;
    const where = this.nearbyWhere(params, point);

    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "listings" l
      LEFT JOIN "marketplace_details" md ON md."listingId" = l."id"
      WHERE ${where}
    `;

    return Number(rows[0]?.count ?? 0);
  }

  private nearbyWhere(params: NearbySearchFilters, point: Prisma.Sql): Prisma.Sql {
    const {
      radiusMeters,
      types,
      categoryIds,
      cityId,
      localityId,
      businessId,
      priceMin,
      priceMax,
      condition,
      verifiedOnly,
      publishedAfter,
    } = params;

    return Prisma.sql`
      l."geo" IS NOT NULL
      AND l."status" = 'PUBLISHED'
      AND l."deletedAt" IS NULL
      AND l."visibility" = 'PUBLIC'
      AND ST_DWithin(l."geo", ${point}, ${radiusMeters})
      ${
        types && types.length > 0
          ? Prisma.sql`AND l."type"::text IN (${Prisma.join(types)})`
          : Prisma.empty
      }
      ${
        categoryIds && categoryIds.length > 0
          ? Prisma.sql`AND (l."categoryId"::text IN (${Prisma.join(categoryIds)}) OR l."subcategoryId"::text IN (${Prisma.join(categoryIds)}))`
          : Prisma.empty
      }
      ${cityId ? Prisma.sql`AND l."cityId" = ${cityId}::uuid` : Prisma.empty}
      ${localityId ? Prisma.sql`AND l."localityId" = ${localityId}::uuid` : Prisma.empty}
      ${businessId ? Prisma.sql`AND l."businessId" = ${businessId}::uuid` : Prisma.empty}
      ${priceMin !== undefined ? Prisma.sql`AND md."price" >= ${priceMin}` : Prisma.empty}
      ${priceMax !== undefined ? Prisma.sql`AND md."price" <= ${priceMax}` : Prisma.empty}
      ${condition ? Prisma.sql`AND md."condition"::text = ${condition}` : Prisma.empty}
      ${publishedAfter ? Prisma.sql`AND l."publishedAt" >= ${publishedAfter}` : Prisma.empty}
      ${
        verifiedOnly
          ? Prisma.sql`AND EXISTS (
              SELECT 1
              FROM "businesses" b
              WHERE b."id" = l."businessId"
                AND b."verificationStatus" = 'VERIFIED'
                AND b."isActive" = true
                AND b."deletedAt" IS NULL
            )`
          : Prisma.empty
      }
    `;
  }

  private nearbyOrder(sort: NearbySearchFilters['sort'], point: Prisma.Sql): Prisma.Sql {
    switch (sort) {
      case 'newest':
        return Prisma.sql`l."publishedAt" DESC NULLS LAST, l."id" ASC`;
      case 'price_asc':
        return Prisma.sql`md."price" ASC NULLS LAST, l."publishedAt" DESC NULLS LAST, l."id" ASC`;
      case 'price_desc':
        return Prisma.sql`md."price" DESC NULLS LAST, l."publishedAt" DESC NULLS LAST, l."id" ASC`;
      case 'popular':
        return Prisma.sql`l."viewCount" DESC, l."publishedAt" DESC NULLS LAST, l."id" ASC`;
      case 'distance':
      default:
        return Prisma.sql`l."geo" <-> ${point}, l."id" ASC`;
    }
  }

  /**
   * Resolves device coordinates to the nearest launched city — the "use my current
   * location" path. Capped at 150 km so a user outside the launch region is offered
   * a city picker instead of a nonsensical nearest match.
   */
  async findNearestCity(latitude: number, longitude: number): Promise<NearbyCityRow | null> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;

    const rows = await this.prisma.$queryRaw<NearbyCityRow[]>`
      SELECT c."id", c."name", c."slug",
             ST_Distance(c."geo", ${point}) AS "distanceMeters"
      FROM "cities" c
      WHERE c."geo" IS NOT NULL
        AND c."isActive" = true
        AND c."isLaunched" = true
        AND ST_DWithin(c."geo", ${point}, 150000)
      ORDER BY c."geo" <-> ${point}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  /**
   * Nearest localities within a city, for the manual locality picker.
   */
  async findNearbyLocalities(
    cityId: string,
    latitude: number,
    longitude: number,
    limit = 10,
  ): Promise<NearbyCityRow[]> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;

    return this.prisma.$queryRaw<NearbyCityRow[]>`
      SELECT lo."id", lo."name", lo."slug",
             ST_Distance(lo."geo", ${point}) AS "distanceMeters"
      FROM "localities" lo
      WHERE lo."cityId" = ${cityId}::uuid
        AND lo."geo" IS NOT NULL
        AND lo."isActive" = true
      ORDER BY lo."geo" <-> ${point}
      LIMIT ${limit}
    `;
  }

  /**
   * Nearest pincodes to a point, nearest first.
   *
   * This is what makes "enter your pincode" work as a location primitive: the pincode
   * gives a centroid, the centroid gives a radius, and the radius gives the listings.
   * ST_DWithin uses the GiST index; the `<->` ordering is index-assisted nearest-neighbour.
   */
  async findNearbyPincodes(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    limit: number,
  ): Promise<Array<{ code: string; distanceMeters: number }>> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;

    return this.prisma.$queryRaw<Array<{ code: string; distanceMeters: number }>>`
      SELECT p."code", ST_Distance(p."geo", ${point}) AS "distanceMeters"
      FROM "pincodes" p
      WHERE p."geo" IS NOT NULL
        AND p."isServiceable" = true
        AND ST_DWithin(p."geo", ${point}, ${radiusMeters})
      ORDER BY p."geo" <-> ${point}
      LIMIT ${limit}
    `;
  }

  /**
   * What people standing near this point said the area actually was.
   *
   * Grouped by the code they chose and counted, nearest first. The radius is deliberately
   * tight: a correction made two kilometres away is about a different street corner, and
   * borrowing it would spread one person's local knowledge over places they never stood.
   */
  async findAreaCorrections(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<Array<{ chosenCode: string; votes: number }>> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;

    return this.prisma.$queryRaw<Array<{ chosenCode: string; votes: number }>>`
      SELECT c."chosenCode", COUNT(*)::int AS votes
      FROM "area_corrections" c
      WHERE c."geo" IS NOT NULL
        AND ST_DWithin(c."geo", ${point}, ${radiusMeters})
      GROUP BY c."chosenCode"
      ORDER BY votes DESC
    `;
  }

  /**
   * Distance between a listing and a point, in metres. Used to render "2.4 km away"
   * on a listing detail page opened directly from a shared link.
   */
  async distanceToListing(
    listingId: string,
    latitude: number,
    longitude: number,
  ): Promise<number | null> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;

    const rows = await this.prisma.$queryRaw<Array<{ distanceMeters: number | null }>>`
      SELECT ST_Distance(l."geo", ${point}) AS "distanceMeters"
      FROM "listings" l
      WHERE l."id" = ${listingId}::uuid AND l."geo" IS NOT NULL
    `;

    return rows[0]?.distanceMeters ?? null;
  }

  /**
   * News events within `radiusMeters` of a point, published since `since`, nearest first.
   * Powers the hyperlocal news feed (the app then ranks by ring + freshness). Uses the GIST
   * index on NewsEvent.geo via ST_DWithin + the KNN <-> operator for ordering.
   */
  async findNearbyNewsEvents(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    since: Date,
    limit: number,
  ): Promise<NearbyNewsEventRow[]> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;

    return this.prisma.$queryRaw<NearbyNewsEventRow[]>`
      SELECT e."id", e."slug", e."title", e."summary", e."categories", e."severity",
             e."trustScore", e."latitude", e."longitude", e."latestUpdateAt",
             ST_Distance(e."geo", ${point}) AS "distanceMeters"
      FROM "NewsEvent" e
      WHERE e."geo" IS NOT NULL
        AND e."removedAt" IS NULL
        AND ST_DWithin(e."geo", ${point}, ${radiusMeters})
        AND e."latestUpdateAt" >= ${since}
      ORDER BY e."geo" <-> ${point}
      LIMIT ${limit}
    `;
  }
}

export interface NearbyNewsEventRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  categories: string[];
  severity: number;
  trustScore: number;
  latitude: number | null;
  longitude: number | null;
  latestUpdateAt: Date;
  distanceMeters: number | null;
}
