import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ListingStatus,
  NotificationType,
  Prisma,
  RoleName,
  VerificationStatus,
} from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { findPublicBrand } from '@locz/public-brands';
import { AuditService } from '../audit/audit.service';
import { paginate, PaginatedDto } from '../common/dto/pagination.dto';
import { localizedName } from '../common/utils/localized-name';
import { businessSlug, loczId } from '../common/utils/slug.util';
import { KeywordTranslationsService } from './keyword-translations.service';
import { categoryNameToArea } from '../common/utils/discovery-areas';
import { attributionFor, describeBusiness } from './business-description';
import { BusinessSearchService } from '../search/business-search.service';
import { matchesKeyword } from '../moderation/rule-based-moderation.provider';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../media/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AddStaffDto,
  BusinessDetailDto,
  BusinessSearchQueryDto,
  BusinessStaffDto,
  BusinessSummaryDto,
  CreateBusinessDto,
  MAX_BUSINESS_KEYWORDS,
  UpdateBusinessDto,
} from './dto/business.dto';

/** Default permission sets per staff role. Owners always hold everything implicitly. */
const STAFF_PERMISSIONS: Record<string, string[]> = {
  MANAGER: ['listing:create', 'listing:update', 'offer:publish', 'enquiry:reply', 'staff:view'],
  EDITOR: ['listing:create', 'listing:update', 'enquiry:reply'],
  VIEWER: ['enquiry:reply'],
};

const BUSINESS_INCLUDE = {
  // Telugu and Hindi names travel with the record because the profile is served at /te and
  // /hi as well as /en. Without them those pages carry translated furniture around English
  // content — which is what a reader sees, and what a search engine indexes.
  // The parent too: the artwork catalogue is keyed by the original category names, and a
  // business filed under a new subcategory has to fall back to its parent's banner.
  category: {
    select: {
      name: true,
      nameTe: true,
      nameHi: true,
      slug: true,
      parent: { select: { name: true } },
    },
  },
  // The state and the mandal complete a postal address. A LocZ "city" is a district, so the
  // full chain a reader expects is street, area, mandal, district, state, pincode.
  city: {
    select: {
      name: true,
      nameTe: true,
      nameHi: true,
      slug: true,
      state: { select: { name: true } },
    },
  },
  address: {
    select: {
      line1: true,
      line2: true,
      landmark: true,
      // The neighbourhood is the most specific thing the page says about where a shop is,
      // so it travels in the reader's script too.
      locality: { select: { name: true, nameTe: true, nameHi: true, mandal: true } },
    },
  },
  hours: true,
  _count: { select: { listings: true } },
} satisfies Prisma.BusinessInclude;

type BusinessRow = Prisma.BusinessGetPayload<{ include: typeof BUSINESS_INCLUDE }>;

/**
 * Business profiles.
 *
 * Creating one is free and needs no approval — verification is a separate, later signal
 * granted by an administrator. Gating creation behind review would stop the directory
 * ever filling up, which is the thing that makes it useful.
 */
@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly businessSearch: BusinessSearchService,
    private readonly keywordTranslations: KeywordTranslationsService,
  ) {}

  async listPublic(query: BusinessSearchQueryDto): Promise<PaginatedDto<BusinessSummaryDto>> {
    const term = query.q?.trim();

    // A text query goes through the ranked, typo-tolerant business search (Postgres tsvector +
    // pg_trgm fuzzy fallback) rather than a plain ILIKE, so "hospitl" still finds hospitals and
    // results come back by relevance. Browsing without a query keeps the cheap filter path below.
    if (term) {
      const { ids, total } = await this.businessSearch.search({
        query: term,
        cityId: query.cityId,
        pincode: query.pincode,
        categoryId: query.categoryId,
        page: query.page,
        limit: query.limit,
      });
      if (ids.length === 0) return paginate([], total, query.page, query.limit);
      const found = await this.prisma.business.findMany({
        where: { id: { in: ids } },
        include: BUSINESS_INCLUDE,
      });
      const rank = new Map(ids.map((id, index) => [id, index]));
      const ordered = found
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
        .map((business) => this.toSummary(business, undefined, query.lang));
      return paginate(ordered, total, query.page, query.limit);
    }

    const where: Prisma.BusinessWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.pincode ? { pincodeCode: query.pincode } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      // The neighbourhood filter, matched through the address rather than on the
      // business, because a locality is a property of where a shop *is* and the
      // address table is where that lives. Scoped by city as well when one is
      // given: locality slugs are unique per city, not globally, so "gandhi-nagar"
      // alone would gather shops from a dozen unrelated towns.
      ...(query.localitySlug
        ? {
            address: {
              locality: {
                slug: query.localitySlug,
                ...(query.cityId ? { cityId: query.cityId } : {}),
              },
            },
          }
        : {}),
      ...(query.verificationStatus
        ? { verificationStatus: query.verificationStatus }
        : query.verifiedOnly
          ? { verificationStatus: VerificationStatus.VERIFIED }
          : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
              { category: { name: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    // "Recommended" used to lead with `listings._count`, which orders on a value Postgres has
    // to compute per row: no index can answer it, so browsing cost a count of every listing
    // for all 3.4M businesses and took over three seconds. It also achieved nothing — not one
    // business has a listing yet, so every row sorted equal on it.
    //
    // Ordering by views first is the same result today and is index-backed. When businesses
    // do start publishing, ranking by listing count needs a denormalised counter column on
    // businesses that a trigger maintains; sorting on a relation count at this scale will
    // never be fast enough, however the query is written.
    const orderBy: Prisma.BusinessOrderByWithRelationInput[] =
      query.sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : [{ viewCount: 'desc' }, { createdAt: 'desc' }];

    const [businesses, total] = await Promise.all([
      this.prisma.business.findMany({
        where,
        include: BUSINESS_INCLUDE,
        orderBy,
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.business.count({ where }),
    ]);

    return paginate(
      businesses.map((business) => this.toSummary(business, undefined, query.lang)),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * How many active businesses sit in each category for an area — powers the "Food · 12,400
   * nearby" counts on the category tiles, so it's obvious which areas are populated. Scoped by
   * city or pincode (the indexed columns) so it stays cheap.
   */
  /**
   * The distinct categories businesses actually use (an import taxonomy separate from the
   * marketplace category tree), with a live count each — powers the city × category hub pages and
   * their cross-links. Ordered by size so the busiest categories lead.
   */
  async businessCategories(): Promise<
    Array<{ id: string; slug: string; name: string; count: number }>
  > {
    return this.prisma.$queryRaw<Array<{ id: string; slug: string; name: string; count: number }>>`
      -- count(*) rather than count(b.*): counting the row forces the heap to be read, which
      -- turned this into a 3.5GB sequential scan once the category tree grew from 45 entries
      -- to 1,581. count(*) can be answered from businesses_category_live_idx alone.
      SELECT c.id, c.slug, c.name, count(*)::int AS count
      FROM categories c
      JOIN businesses b ON b."categoryId" = c.id AND b."deletedAt" IS NULL AND b."isActive"
      GROUP BY c.id, c.slug, c.name
      ORDER BY count DESC
    `;
  }

  async categoryCounts(scope: {
    cityId?: string;
    pincode?: string;
  }): Promise<Array<{ categoryId: string; count: number }>> {
    const where: Prisma.BusinessWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(scope.cityId ? { cityId: scope.cityId } : {}),
      ...(scope.pincode ? { pincodeCode: scope.pincode } : {}),
    };
    const groups = await this.prisma.business.groupBy({
      by: ['categoryId'],
      where,
      _count: { _all: true },
    });
    return groups.map((g) => ({ categoryId: g.categoryId, count: g._count._all }));
  }

  /**
   * A page of business slugs for the XML sitemap, restricted to businesses with real substance
   * (claimed, verified, or carrying a phone or description) — a directory that submits millions of
   * bare name-only pages invites a thin-content penalty, so the sparse imports are held back. The
   * caller shards `total` into 50k-URL sitemap files. Cached hard by the route, so the count runs
   * at most once a day.
   */
  /**
   * Case-insensitive POSIX pattern matching the imported rows that are not businesses — civic and
   * government points (health sub-centres, anganwadis, panchayat offices, PHCs, ration/fair-price
   * shops) and placeholder names. Used to keep them out of search results.
   */
  private static readonly JUNK_NAME_RE =
    '(sub ?centre|anganwadi|panchayat|primary health|fair price|ration shop|milk collection|^unnamed|^unknown|^n/?a$|^null$|^test$)';

  /**
   * The single WHERE that defines the sitemap's set of pages, shared verbatim by the count, the
   * shard cursors and the shard slugs so all three see exactly the same rows (otherwise the shard
   * boundaries and the shard contents would drift apart). A page qualifies when it has real
   * substance (claimed, verified, or carrying a phone or description) AND is not one of the
   * imported non-businesses (civic POIs, placeholder or too-short names) — submitting those thin,
   * junk pages to Google risks a site-wide thin-content signal. Every column referenced here is in
   * the covering index `businesses_sitemap_cov2_idx`, so these stay index-only and fast.
   */
  private static sitemapWhereSql(): Prisma.Sql {
    return Prisma.sql`"deletedAt" IS NULL AND "isActive"
      AND ("claimStatus" = 'CLAIMED' OR "verificationStatus" = 'VERIFIED'
        OR "primaryPhone" IS NOT NULL OR description IS NOT NULL)
      AND name !~* ${BusinessesService.JUNK_NAME_RE}
      AND char_length(btrim(name)) > 2`;
  }

  // The curated total barely moves and its count is a multi-second scan, so it is memoised in
  // process for a day — the sitemap index reads it without re-counting on every crawler fetch.
  private sitemapTotalCache: { value: number; at: number } | null = null;

  async sitemapCount(): Promise<number> {
    const now = Date.now();
    if (this.sitemapTotalCache && now - this.sitemapTotalCache.at < 86_400_000) {
      return this.sitemapTotalCache.value;
    }
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT count(*)::bigint AS count FROM businesses WHERE ${BusinessesService.sitemapWhereSql()}`,
    );
    const value = Number(rows[0]?.count ?? 0);
    this.sitemapTotalCache = { value, at: now };
    return value;
  }

  async sitemapSlugs(
    page: number,
    pageSize: number,
  ): Promise<{ slugs: Array<{ slug: string; updatedAt: Date }> }> {
    const slugs = await this.prisma.$queryRaw<Array<{ slug: string; updatedAt: Date }>>(
      Prisma.sql`SELECT slug, "updatedAt" FROM businesses
                 WHERE ${BusinessesService.sitemapWhereSql()}
                 ORDER BY id ASC LIMIT ${pageSize} OFFSET ${page * pageSize}`,
    );
    return { slugs };
  }

  private sitemapCursorCache: { value: string[]; at: number } | null = null;

  /**
   * The first `id` of every sitemap shard, so shards can be fetched by keyset (`id >= cursor`)
   * instead of OFFSET. OFFSET re-scans from the start on every shard, so a deep shard skips
   * millions of rows and blows past a crawler's fetch timeout; keyset is O(shard size) at any
   * depth. Computed with one index-only scan of the covering sitemap index and memoised for a day
   * (the curated set barely moves), so a crawler pays for it at most once per day.
   */
  async sitemapShardCursors(shardSize: number): Promise<string[]> {
    const now = Date.now();
    if (this.sitemapCursorCache && now - this.sitemapCursorCache.at < 86_400_000) {
      return this.sitemapCursorCache.value;
    }

    // Persisted, not just memoised in this process.
    //
    // Computing these walks 2.4 million index entries through a window function and takes
    // about twenty-five seconds. A per-process memo meant every deploy threw the answer away,
    // and the next crawler request paid the full cost — long enough that the web layer's fetch
    // gave up, fell back to an empty slug list, and served a valid sitemap declaring the shard
    // to have no pages. Search Console recorded that on 177 shards. Keeping the answer in the
    // database means a restart no longer costs anything.
    const stored = await this.prisma.$queryRaw<Array<{ cursor_id: string }>>(
      Prisma.sql`SELECT cursor_id FROM sitemap_shard_cursors
                 WHERE shard_size = ${shardSize}
                   AND computed_at > now() - interval '24 hours'
                 ORDER BY position`,
    );
    if (stored.length > 0) {
      const value = stored.map((r) => r.cursor_id);
      this.sitemapCursorCache = { value, at: now };
      return value;
    }

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT id FROM (
          SELECT id, row_number() OVER (ORDER BY id) AS rn
          FROM businesses
          WHERE ${BusinessesService.sitemapWhereSql()}
        ) t
        WHERE (rn - 1) % ${shardSize} = 0
        ORDER BY id`,
    );
    const value = rows.map((r) => r.id);

    // Best effort: a sitemap must still be served if this write fails.
    await this.prisma
      .$executeRaw(
        Prisma.sql`INSERT INTO sitemap_shard_cursors (shard_size, position, cursor_id, computed_at)
                   SELECT ${shardSize}, ordinality::int - 1, value::uuid, now()
                   FROM unnest(${value}::text[]) WITH ORDINALITY AS t(value, ordinality)
                   ON CONFLICT (shard_size, position)
                   DO UPDATE SET cursor_id = excluded.cursor_id, computed_at = excluded.computed_at`,
      )
      .catch((error: unknown) => {
        new Logger(BusinessesService.name).warn(
          `could not persist sitemap cursors: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    this.sitemapCursorCache = { value, at: now };
    return value;
  }

  /** One shard's URLs by keyset: the curated businesses from `fromId` onward. */
  async sitemapSlugsFrom(
    fromId: string,
    limit: number,
  ): Promise<{ slugs: Array<{ slug: string; updatedAt: Date }> }> {
    const slugs = await this.prisma.$queryRaw<Array<{ slug: string; updatedAt: Date }>>(
      Prisma.sql`SELECT slug, "updatedAt" FROM businesses
                 WHERE ${BusinessesService.sitemapWhereSql()} AND id >= ${fromId}
                 ORDER BY id ASC LIMIT ${limit}`,
    );
    return { slugs };
  }

  /**
   * Businesses near a point, nearest first, with an exact distance on each — the geo variant
   * of listPublic used by the Home "Businesses near you" surface. Uses the PostGIS GiST index
   * (ST_DWithin to filter, KNN `<->` to order), paginated 20 at a time.
   */
  /**
   * The category ids that belong to a discovery area. Businesses use an import taxonomy distinct
   * from the marketplace tree, so each category is classified by the name of its root ancestor
   * (the same rule that powers the "Around you" counts), then kept if that maps to `area`.
   */
  private async categoryIdsForArea(area: string): Promise<string[]> {
    const categories = await this.prisma.category.findMany({
      select: { id: true, parentId: true, name: true },
    });
    const byId = new Map(categories.map((category) => [category.id, category]));
    const rootName = (id: string): string => {
      let current = byId.get(id);
      for (let hops = 0; current?.parentId && hops < 12; hops += 1) {
        current = byId.get(current.parentId) ?? current;
        if (!current.parentId) break;
      }
      return current?.name ?? '';
    };
    return categories.filter((c) => categoryNameToArea(rootName(c.id)) === area).map((c) => c.id);
  }

  async nearby(query: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    pincode?: string;
    categoryId?: string;
    area?: string;
    q?: string;
    verifiedOnly?: boolean;
    page: number;
    limit: number;
    skip: number;
    lang?: string;
  }): Promise<PaginatedDto<BusinessSummaryDto>> {
    const radiusMeters = (query.radiusKm ?? 25) * 1000;
    // The `pincodes` table's lat/lng is a coarse district centroid that can be ~18km from the
    // pincode's real businesses, so for a pincode search we measure distance from the centroid of
    // that pincode's own businesses instead — honest distances and a meaningful nearest-first.
    // A plain "near me" query keeps the caller's coordinates.
    const point = query.pincode
      ? Prisma.sql`(SELECT ST_SetSRID(ST_MakePoint(avg(longitude), avg(latitude)), 4326)::geography
                    FROM "businesses"
                    WHERE "pincodeCode" = ${query.pincode} AND "deletedAt" IS NULL AND "geo" IS NOT NULL)`
      : Prisma.sql`ST_SetSRID(ST_MakePoint(${query.longitude}::double precision, ${query.latitude}::double precision), 4326)::geography`;
    const term = query.q?.trim();

    // A text query goes through the ranked, typo-tolerant search (relevance first, then distance)
    // rather than a plain ILIKE. An exact pincode is not radius-clipped (its centroid is coarse);
    // a plain "near me" query uses the geo radius. Discovery-area browsing (which maps to many
    // categories) stays on the geo path below. No query at all → pure-geo browse below.
    if (term && !query.area) {
      const { ids, total } = await this.businessSearch.search({
        query: term,
        pincode: query.pincode,
        categoryId: query.categoryId,
        ...(query.pincode
          ? {}
          : { latitude: query.latitude, longitude: query.longitude, radiusKm: query.radiusKm }),
        page: query.page,
        limit: query.limit,
      });
      if (ids.length === 0) return paginate([], total, query.page, query.limit);
      const distanceRows = await this.prisma.$queryRaw<
        Array<{ id: string; distanceMeters: number }>
      >(
        Prisma.sql`SELECT id, ST_Distance("geo", ${point}) AS "distanceMeters"
                   FROM "businesses"
                   WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
      const distanceById = new Map(distanceRows.map((r) => [r.id, Number(r.distanceMeters)]));
      const found = await this.prisma.business.findMany({
        where: { id: { in: ids } },
        include: BUSINESS_INCLUDE,
      });
      const rank = new Map(ids.map((id, index) => [id, index]));
      const items = found
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
        .map((business) => this.toSummary(business, distanceById.get(business.id), query.lang));
      return paginate(items, total, query.page, query.limit);
    }

    // The business filter is by discovery area ("Food"), since businesses use an import taxonomy
    // distinct from the marketplace category tree. An explicit categoryId is still honoured for
    // callers that pass a real business categoryId directly.
    let categoryIds: string[] | null = null;
    if (query.area) categoryIds = await this.categoryIdsForArea(query.area);
    else if (query.categoryId) categoryIds = [query.categoryId];

    const where = Prisma.join(
      [
        Prisma.sql`b."deletedAt" IS NULL`,
        Prisma.sql`b."isActive"`,
        Prisma.sql`b."geo" IS NOT NULL`,
        // An explicit pincode is a precise, intended filter, so it selects that pincode exactly
        // and is NOT clipped by the radius. Pincodes resolve to a coarse district centroid that can
        // sit 10–30 km from the pincode's actual businesses, so a radius around it would wrongly
        // drop most of them (the "506001 works but 506002 is empty" bug). Without a pincode this is
        // a true "near me" query, so the radius applies. Either way we order by distance below.
        query.pincode
          ? Prisma.sql`b."pincodeCode" = ${query.pincode}`
          : Prisma.sql`ST_DWithin(b."geo", ${point}, ${radiusMeters})`,
        // Hide the imported non-businesses — government sub-centres, anganwadis, ration shops and
        // unnamed/placeholder rows — so real shops surface instead of civic POIs. Passed as a bound
        // parameter, so no regex escaping games.
        Prisma.sql`b."name" !~* ${BusinessesService.JUNK_NAME_RE}`,
        Prisma.sql`char_length(btrim(b."name")) > 2`,
        categoryIds
          ? categoryIds.length > 0
            ? Prisma.sql`b."categoryId" IN (${Prisma.join(
                categoryIds.map((id) => Prisma.sql`${id}::uuid`),
              )})`
            : Prisma.sql`FALSE`
          : Prisma.sql`TRUE`,
        term
          ? Prisma.sql`(b."name" ILIKE ${`%${term}%`} OR b."description" ILIKE ${`%${term}%`})`
          : Prisma.sql`TRUE`,
        query.verifiedOnly
          ? Prisma.sql`b."verificationStatus"::text = 'VERIFIED'`
          : Prisma.sql`TRUE`,
      ],
      ' AND ',
    );

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; distanceMeters: number }>>(
        Prisma.sql`SELECT b."id", ST_Distance(b."geo", ${point}) AS "distanceMeters"
                   FROM "businesses" b WHERE ${where}
                   ORDER BY b."geo" <-> ${point}
                   LIMIT ${query.limit} OFFSET ${query.skip}`,
      ),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(
        Prisma.sql`SELECT count(*)::bigint AS total FROM "businesses" b WHERE ${where}`,
      ),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    if (rows.length === 0) return paginate([], total, query.page, query.limit);

    const distanceById = new Map(rows.map((r) => [r.id, Number(r.distanceMeters)]));
    const businesses = await this.prisma.business.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: BUSINESS_INCLUDE,
    });
    const order = new Map(rows.map((r, index) => [r.id, index]));
    const items = businesses
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((business) => this.toSummary(business, distanceById.get(business.id), query.lang));
    return paginate(items, total, query.page, query.limit);
  }

  /**
   * Cleans the terms a business claims to sell, and refuses the ones it may not.
   *
   * These go straight into the search index, so an unchecked field is a way to make a shop
   * appear for words the platform has decided nobody may advertise — the same abuse the
   * listing moderation rules exist to stop, arriving through a different door.
   *
   * Rejects rather than silently dropping. An owner who typed something disallowed should be
   * told, not left believing a term is live when it was quietly discarded.
   */
  private async normaliseKeywords(keywords: string[]): Promise<string[]> {
    const cleaned = Array.from(
      new Set(
        keywords
          .map((keyword) => keyword.trim().toLowerCase().replace(/\s+/g, ' '))
          // A single letter matches almost everything and describes nothing.
          .filter((keyword) => keyword.length >= 2),
      ),
    ).slice(0, MAX_BUSINESS_KEYWORDS);

    if (cleaned.length === 0) return [];

    const banned = await this.prisma.bannedKeyword.findMany({
      where: { isActive: true },
      select: { keyword: true },
    });

    const rejected = cleaned.filter((keyword) =>
      banned.some((entry) => matchesKeyword(keyword, entry.keyword)),
    );
    if (rejected.length > 0) {
      throw new BadRequestException(
        `These cannot be listed on LocZ: ${rejected.join(', ')}. Remove them and save again.`,
      );
    }

    return cleaned;
  }

  async create(userId: string, dto: CreateBusinessDto): Promise<BusinessDetailDto> {
    const publicBrand = findPublicBrand(dto.name);
    if (publicBrand) {
      throw new ConflictException(
        `${publicBrand.displayName} locations are maintained as public brand records. Report a missing or incorrect branch instead of creating an owned profile.`,
      );
    }
    const keywords = dto.keywords ? await this.normaliseKeywords(dto.keywords) : [];
    const [category, city] = await Promise.all([
      this.prisma.category.findUnique({ where: { id: dto.categoryId } }),
      this.prisma.city.findUnique({ where: { id: dto.cityId } }),
    ]);
    if (!category) throw new BadRequestException('Choose a valid business category');
    if (!city) throw new BadRequestException('Choose a valid city');

    // One owner may run several businesses, but a cap keeps a compromised account from
    // spraying the directory.
    const existingCount = await this.prisma.business.count({
      where: { ownerId: userId, deletedAt: null },
    });
    if (existingCount >= 10) {
      throw new ForbiddenException('You have reached the limit of 10 businesses per account');
    }

    const slug = await this.uniqueSlug(dto.name, city.name);
    const addressId = dto.addressLine?.trim() ? uuid() : undefined;
    const business = await this.prisma.$transaction(async (transaction) => {
      if (addressId) {
        await transaction.address.create({
          data: {
            id: addressId,
            line1: dto.addressLine?.trim(),
            cityId: dto.cityId,
            latitude: dto.latitude ?? city.latitude,
            longitude: dto.longitude ?? city.longitude,
          },
        });
      }

      return transaction.business.create({
        data: {
          id: uuid(),
          ownerId: userId,
          name: dto.name.trim(),
          businessType: dto.businessType,
          slug,
          categoryId: dto.categoryId,
          cityId: dto.cityId,
          addressId,
          description: dto.description,
          scale: dto.scale,
          offering: dto.offering,
          keywords,
          // The `geo` column is derived from these by trigger (ADR-0009).
          latitude: dto.latitude ?? city.latitude,
          longitude: dto.longitude ?? city.longitude,
          primaryPhone: dto.primaryPhone,
          whatsappNumber: dto.whatsappNumber,
          email: dto.email,
          website: dto.website,
          ...(dto.hours && dto.hours.length > 0
            ? {
                hours: {
                  createMany: {
                    data: dto.hours.map((hour) => ({
                      id: uuid(),
                      dayOfWeek: hour.dayOfWeek,
                      opensAt: hour.opensAt,
                      closesAt: hour.closesAt,
                      isClosed: hour.isClosed ?? false,
                    })),
                  },
                },
              }
            : {}),
        },
        include: BUSINESS_INCLUDE,
      });
    });

    // Registering a business is what makes someone a business owner — the role is
    // granted on first use rather than requested up front.
    await this.rbac.ensureRole(userId, RoleName.BUSINESS_OWNER);

    await this.audit.record({
      action: 'business.create',
      entityType: 'Business',
      entityId: business.id,
      actorId: userId,
      changes: { name: business.name, cityId: dto.cityId },
    });

    return this.toDetail(business, userId);
  }

  async getBySlug(slug: string, viewerId?: string, lang?: string): Promise<BusinessDetailDto> {
    let business = await this.prisma.business.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      include: BUSINESS_INCLUDE,
    });

    // Not found under that slug? It may be one the business used to have. Imported records
    // were re-slugged from `name-000j-hrcf` to something a person can read, and every old URL
    // is already indexed and shared. Resolving the alias here — rather than 404ing — is what
    // keeps those links alive; the caller compares the slug it asked for against the slug it
    // gets back and redirects to the canonical one.
    if (!business) {
      const alias = await this.prisma.businessSlugAlias.findUnique({
        where: { slug },
        select: { businessId: true },
      });
      if (alias) {
        business = await this.prisma.business.findFirst({
          where: { id: alias.businessId, deletedAt: null, isActive: true },
          include: BUSINESS_INCLUDE,
        });
      }
    }

    if (!business) throw new NotFoundException('Business not found');

    // An owner opening their workspace is maintenance, not customer interest.
    // Best-effort for real visitors — a counter failure must never break the profile.
    if (viewerId !== business.ownerId) {
      await this.prisma.business
        .update({ where: { id: business.id }, data: { viewCount: { increment: 1 } } })
        .catch(() => undefined);
    }

    return this.toDetail(business, viewerId, lang);
  }

  async listMine(userId: string): Promise<BusinessSummaryDto[]> {
    const businesses = await this.prisma.business.findMany({
      where: {
        deletedAt: null,
        // Both owned businesses and those where this user is accepted staff.
        OR: [{ ownerId: userId }, { staff: { some: { userId, acceptedAt: { not: null } } } }],
      },
      include: BUSINESS_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return businesses.map((business) => this.toSummary(business));
  }

  async update(
    businessId: string,
    userId: string,
    dto: UpdateBusinessDto,
  ): Promise<BusinessDetailDto> {
    const existing = await this.requireManageAccess(businessId, userId);
    let newAddressId: string | undefined;

    if (dto.addressLine !== undefined) {
      if (existing.addressId) {
        await this.prisma.address.update({
          where: { id: existing.addressId },
          data: {
            line1: dto.addressLine.trim() || null,
            cityId: dto.cityId,
            latitude: dto.latitude,
            longitude: dto.longitude,
          },
        });
      } else if (dto.addressLine.trim()) {
        const address = await this.prisma.address.create({
          data: {
            id: uuid(),
            line1: dto.addressLine.trim(),
            cityId: dto.cityId ?? existing.cityId,
            latitude: dto.latitude ?? existing.latitude,
            longitude: dto.longitude ?? existing.longitude,
          },
        });
        newAddressId = address.id;
      }
    }

    // Replaced wholesale rather than merged: the field is the shop's current answer to
    // "what do you sell", and there would otherwise be no way to remove a term.
    const keywords = dto.keywords ? await this.normaliseKeywords(dto.keywords) : undefined;

    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        businessType: dto.businessType,
        name: dto.name?.trim(),
        description: dto.description,
        scale: dto.scale,
        offering: dto.offering,
        ...(keywords ? { keywords } : {}),
        latitude: dto.latitude,
        longitude: dto.longitude,
        primaryPhone: dto.primaryPhone,
        whatsappNumber: dto.whatsappNumber,
        email: dto.email,
        website: dto.website,
        categoryId: dto.categoryId,
        cityId: dto.cityId,
        ...(newAddressId ? { addressId: newAddressId } : {}),
        // Editing contact details or address invalidates a verification that was granted
        // against the old ones.
        ...(dto.name || dto.primaryPhone || dto.addressLine
          ? existing.verificationStatus === VerificationStatus.VERIFIED
            ? { verificationStatus: VerificationStatus.PENDING, verifiedAt: null }
            : {}
          : {}),
      },
      include: BUSINESS_INCLUDE,
    });

    if (dto.hours) {
      await this.prisma.$transaction([
        this.prisma.businessHour.deleteMany({ where: { businessId } }),
        this.prisma.businessHour.createMany({
          data: dto.hours.map((hour) => ({
            id: uuid(),
            businessId,
            dayOfWeek: hour.dayOfWeek,
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
            isClosed: hour.isClosed ?? false,
          })),
        }),
      ]);
    }

    await this.audit.record({
      action: 'business.update',
      entityType: 'Business',
      entityId: businessId,
      actorId: userId,
      changes: this.audit.diff(
        { name: existing.name, phone: existing.primaryPhone },
        { name: updated.name, phone: updated.primaryPhone },
      ),
    });

    return this.getById(businessId, userId);
  }

  async getById(businessId: string, viewerId?: string): Promise<BusinessDetailDto> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      include: BUSINESS_INCLUDE,
    });
    if (!business) throw new NotFoundException('Business not found');
    return this.toDetail(business, viewerId);
  }

  async listStaff(businessId: string, userId: string): Promise<BusinessStaffDto[]> {
    await this.requireManageAccess(businessId, userId);

    const staff = await this.prisma.businessStaff.findMany({
      where: { businessId },
      include: { user: { select: { displayName: true } } },
      orderBy: { invitedAt: 'asc' },
    });

    return staff.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      displayName: entry.user.displayName,
      role: entry.role,
      permissions: entry.permissions,
      acceptedAt: entry.acceptedAt,
    }));
  }

  /**
   * Adds a staff member by phone number. The person must already have a LocZ account —
   * inviting an arbitrary number would let a business owner spam strangers with SMS.
   */
  async addStaff(businessId: string, ownerId: string, dto: AddStaffDto): Promise<BusinessStaffDto> {
    const business = await this.requireOwner(businessId, ownerId);

    const user = await this.prisma.user.findUnique({ where: { phoneE164: dto.phone } });
    if (!user) {
      throw new NotFoundException('No LocZ account uses that number. Ask them to sign up first.');
    }
    if (user.id === business.ownerId) {
      throw new BadRequestException('You already own this business');
    }

    const permissions = STAFF_PERMISSIONS[dto.role];
    if (!permissions) throw new BadRequestException('Unknown staff role');

    const existing = await this.prisma.businessStaff.findUnique({
      where: { businessId_userId: { businessId, userId: user.id } },
    });
    if (existing) throw new ConflictException('That person is already staff on this business');

    const staff = await this.prisma.businessStaff.create({
      data: {
        id: uuid(),
        businessId,
        userId: user.id,
        role: dto.role,
        permissions,
        // Accepted immediately: the owner knows who they are adding, and an invitation
        // flow buys nothing at this scale.
        acceptedAt: new Date(),
      },
      include: { user: { select: { displayName: true } } },
    });

    await this.audit.record({
      action: 'business.staff_add',
      entityType: 'Business',
      entityId: businessId,
      actorId: ownerId,
      changes: { staffUserId: user.id, role: dto.role },
    });

    return {
      id: staff.id,
      userId: staff.userId,
      displayName: staff.user.displayName,
      role: staff.role,
      permissions: staff.permissions,
      acceptedAt: staff.acceptedAt,
    };
  }

  async removeStaff(businessId: string, ownerId: string, staffId: string): Promise<void> {
    await this.requireOwner(businessId, ownerId);

    const staff = await this.prisma.businessStaff.findFirst({
      where: { id: staffId, businessId },
    });
    if (!staff) throw new NotFoundException('Staff member not found');

    await this.prisma.businessStaff.delete({ where: { id: staffId } });
    await this.audit.record({
      action: 'business.staff_remove',
      entityType: 'Business',
      entityId: businessId,
      actorId: ownerId,
      changes: { staffUserId: staff.userId },
    });
  }

  async requestVerification(businessId: string, ownerId: string): Promise<void> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, ownerId, deletedAt: null },
      include: { hours: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    if (business.verificationStatus === VerificationStatus.VERIFIED) {
      throw new ConflictException('This business is already verified');
    }
    if (business.verificationStatus === VerificationStatus.PENDING) {
      throw new ConflictException('Verification is already under review');
    }

    const missing = [
      !business.description?.trim() ? 'description' : null,
      !business.addressId ? 'address' : null,
      !business.primaryPhone ? 'business phone' : null,
      business.hours.length === 0 ? 'opening hours' : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Complete ${missing.join(', ')} before requesting verification`,
      );
    }

    await this.prisma.business.update({
      where: { id: businessId },
      data: { verificationStatus: VerificationStatus.PENDING },
    });
    await this.audit.record({
      action: 'business.verification_request',
      entityType: 'Business',
      entityId: businessId,
      actorId: ownerId,
      changes: { from: business.verificationStatus, to: VerificationStatus.PENDING },
    });
  }

  /** Administrator action — verification is a trust signal, never self-service. */
  async setVerification(
    businessId: string,
    adminId: string,
    status: VerificationStatus,
    note?: string,
  ): Promise<void> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
    });
    if (!business) throw new NotFoundException('Business not found');

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        verificationStatus: status,
        verifiedAt: status === VerificationStatus.VERIFIED ? new Date() : null,
      },
    });

    await this.audit.record({
      action: 'business.verification',
      entityType: 'Business',
      entityId: businessId,
      actorId: adminId,
      actorRole: 'ADMINISTRATOR',
      changes: { from: business.verificationStatus, to: status, note: note ?? null },
    });

    const outcome =
      status === VerificationStatus.VERIFIED
        ? 'verified'
        : status === VerificationStatus.REJECTED
          ? 'not approved'
          : status.toLowerCase();
    // An unclaimed directory business has nobody to tell. Skipping is correct: the
    // alternative is inventing a recipient for a decision nobody asked for.
    if (!business.ownerId) return;

    await this.notifications.create({
      userId: business.ownerId,
      type: NotificationType.BUSINESS_VERIFICATION_UPDATE,
      title: `Business verification ${outcome}`,
      body:
        status === VerificationStatus.VERIFIED
          ? `${business.name} now shows the verified business badge.`
          : `${business.name} verification is ${outcome}.${note ? ` ${note}` : ''}`,
      data: { entityId: business.id, slug: business.slug, status },
    });
  }

  async delete(businessId: string, userId: string): Promise<void> {
    await this.requireOwner(businessId, userId);

    // Soft delete, and the business's listings go with it — leaving orphaned listings
    // pointing at a business that no longer exists is worse than hiding both.
    await this.prisma.$transaction([
      this.prisma.business.update({
        where: { id: businessId },
        data: { deletedAt: new Date(), isActive: false },
      }),
      this.prisma.listing.updateMany({
        where: { businessId, status: { in: [ListingStatus.PUBLISHED, ListingStatus.PAUSED] } },
        data: { status: ListingStatus.ARCHIVED },
      }),
    ]);

    await this.audit.record({
      action: 'business.delete',
      entityType: 'Business',
      entityId: businessId,
      actorId: userId,
    });
  }

  // -------------------------------------------------------------------

  private async requireOwner(businessId: string, userId: string) {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
    });
    if (!business) throw new NotFoundException('Business not found');
    if (business.ownerId !== userId) {
      throw new ForbiddenException('Only the business owner can do this');
    }
    return business;
  }

  private async requireManageAccess(businessId: string, userId: string) {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      include: { staff: { where: { userId } } },
    });
    if (!business) throw new NotFoundException('Business not found');

    const staff = business.staff[0];
    const canManage =
      business.ownerId === userId ||
      (staff?.acceptedAt !== null && staff?.permissions.includes('listing:update'));

    if (!canManage) throw new ForbiddenException('You cannot manage this business');
    return business;
  }

  /**
   * Slugs include the city because "sri lakshmi electronics" exists in every town in the
   * state, and end in a random reference code so every business — imported or created here —
   * has a LocZ ID to quote.
   *
   * The code also removes the read-then-write race the old collision loop had: two people
   * registering the same shop name in the same city at the same moment could both find the
   * base slug free. It still retries, but only against an astronomically unlikely clash.
   */
  private async uniqueSlug(name: string, cityName: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = businessSlug(name, cityName);
      const taken = await this.prisma.business.findUnique({ where: { slug: candidate } });
      if (!taken) return candidate;
    }
    return businessSlug(name, `${cityName}-${Date.now().toString(36)}`);
  }

  /**
   * A business as it appears in a list.
   *
   * `lang` is threaded all the way down here because these rows are what the directory, the
   * city hubs and "similar businesses nearby" render — a Telugu page listing English category
   * names is the same fault as a Telugu page with an English description, just repeated once
   * per card.
   */
  private toSummary(
    business: BusinessRow,
    distanceMeters?: number,
    lang?: string,
  ): BusinessSummaryDto {
    const publicBrand = findPublicBrand(business.name);
    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      businessType: business.businessType,
      categoryName: localizedName(business.category, lang),
      cityName: localizedName(business.city, lang),
      pincode: business.pincodeCode ?? null,
      ...(distanceMeters !== undefined ? { distanceMeters: Math.round(distanceMeters) } : {}),
      logoUrl: business.logoMediaId ? this.storage.publicUrl(business.logoMediaId) : null,
      publicBrandKey: publicBrand?.key ?? null,
      isClaimable:
        !publicBrand && business.ownerId === null && business.claimStatus === 'UNCLAIMED',
      verificationStatus: business.verificationStatus,
      claimStatus: business.claimStatus,
      listingCount: business._count.listings,
      viewCount: business.viewCount,
      description: business.description,
      addressLine: business.address?.line1 ?? null,
      latitude: business.latitude ? Number(business.latitude) : null,
      longitude: business.longitude ? Number(business.longitude) : null,
      hours: business.hours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        isClosed: hour.isClosed,
      })),
    };
  }

  private toDetail(business: BusinessRow, viewerId?: string, lang?: string): BusinessDetailDto {
    const localityName = business.address?.locality
      ? localizedName(business.address.locality, lang)
      : null;
    const landmark = business.address?.landmark ?? null;
    // The description is composed from these two names, so localising them here is what
    // makes the /te and /hi pages actually read in those languages.
    const categoryName = localizedName(business.category, lang);
    const cityName = localizedName(business.city, lang);
    // The terms are shown inside the sentence, so they have to change language with it.
    const keywords = this.keywordTranslations.localize(business.keywords, lang);
    const described = describeBusiness(
      {
        categoryName,
        localityName,
        landmark,
        pincode: business.pincodeCode,
        cityName,
        keywords,
        description: business.description,
      },
      lang,
    );

    return {
      ...this.toSummary(business, undefined, lang),
      // toSummary carries the English names; the profile page speaks the reader's language.
      categoryName,
      cityName,
      // An imported record has no description of its own, so one is composed from what the
      // record actually holds. Never stored: it is a view of the business, not a fact about
      // it, and the day somebody claims the shop their words simply replace it.
      description: described.text,
      descriptionIsGenerated: described.generated,
      attribution: attributionFor(business),
      scale: business.scale,
      offering: business.offering,
      keywords,
      localityName,
      landmark,
      socialLinks: business.socialLinks,
      loczId: loczId(business.slug),
      parentCategoryName: business.category.parent?.name ?? null,
      stateName: business.city.state?.name ?? null,
      // The slugs the hub pages are addressed by. Returned rather than derived,
      // because slugifying the display name guesses right most of the time and a
      // breadcrumb that guesses wrong is a 404 on the way out of the page.
      citySlug: business.city.slug,
      categorySlug: business.category.slug,
      mandal: business.address?.locality?.mandal ?? null,
      categoryId: business.categoryId,
      cityId: business.cityId,
      addressLine:
        [business.address?.line1, business.address?.line2].filter(Boolean).join(', ') || null,
      latitude: business.latitude ? Number(business.latitude) : null,
      longitude: business.longitude ? Number(business.longitude) : null,
      primaryPhone: business.primaryPhone,
      whatsappNumber: business.whatsappNumber,
      email: business.email,
      website: business.website,
      hours: business.hours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        isClosed: hour.isClosed,
      })),
      isOwner: business.ownerId === viewerId,
      createdAt: business.createdAt,
    };
  }
}
