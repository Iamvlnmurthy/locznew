import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface NearbyListingRow {
  id: string;
  distanceMeters: number;
}

export interface NearbySearchParams {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  types?: string[];
  categoryIds?: string[];
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
    const { latitude, longitude, radiusMeters, types, categoryIds, limit, offset } = params;

    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;

    const typeFilter =
      types && types.length > 0
        ? Prisma.sql`AND l."type"::text IN (${Prisma.join(types)})`
        : Prisma.empty;

    const categoryFilter =
      categoryIds && categoryIds.length > 0
        ? Prisma.sql`AND (l."categoryId"::text IN (${Prisma.join(categoryIds)}) OR l."subcategoryId"::text IN (${Prisma.join(categoryIds)}))`
        : Prisma.empty;

    return this.prisma.$queryRaw<NearbyListingRow[]>`
      SELECT l."id",
             ST_Distance(l."geo", ${point}) AS "distanceMeters"
      FROM "listings" l
      WHERE l."geo" IS NOT NULL
        AND l."status" = 'PUBLISHED'
        AND l."deletedAt" IS NULL
        AND l."visibility" = 'PUBLIC'
        AND ST_DWithin(l."geo", ${point}, ${radiusMeters})
        ${typeFilter}
        ${categoryFilter}
      ORDER BY l."geo" <-> ${point}
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  /**
   * How many published listings sit inside the radius — used to decide whether to
   * widen the radius automatically when a sparse locality would otherwise show
   * an empty feed.
   */
  async countNearbyListings(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<number> {
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography`;

    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "listings" l
      WHERE l."geo" IS NOT NULL
        AND l."status" = 'PUBLISHED'
        AND l."deletedAt" IS NULL
        AND ST_DWithin(l."geo", ${point}, ${radiusMeters})
    `;

    return Number(rows[0]?.count ?? 0);
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
}
