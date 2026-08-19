import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
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
import { AuditService } from '../audit/audit.service';
import { paginate, PaginatedDto } from '../common/dto/pagination.dto';
import { slugify } from '../common/utils/slug.util';
import { categoryNameToArea } from '../common/utils/discovery-areas';
import { attributionFor, describeBusiness } from './business-description';
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
  category: { select: { name: true } },
  city: { select: { name: true } },
  address: { select: { line1: true } },
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
  ) {}

  async listPublic(query: BusinessSearchQueryDto): Promise<PaginatedDto<BusinessSummaryDto>> {
    const term = query.q?.trim();
    const where: Prisma.BusinessWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.pincode ? { pincodeCode: query.pincode } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
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

    const orderBy: Prisma.BusinessOrderByWithRelationInput[] =
      query.sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : query.sort === 'popular'
          ? [{ viewCount: 'desc' }, { createdAt: 'desc' }]
          : [{ listings: { _count: 'desc' } }, { viewCount: 'desc' }, { createdAt: 'desc' }];

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
      businesses.map((business) => this.toSummary(business)),
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
  async sitemapSlugs(
    page: number,
    pageSize: number,
  ): Promise<{ slugs: Array<{ slug: string; updatedAt: Date }>; total: number }> {
    const where: Prisma.BusinessWhereInput = {
      deletedAt: null,
      isActive: true,
      OR: [
        { claimStatus: 'CLAIMED' },
        { verificationStatus: 'VERIFIED' },
        { primaryPhone: { not: null } },
        { description: { not: null } },
      ],
    };
    const [slugs, total] = await Promise.all([
      this.prisma.business.findMany({
        where,
        select: { slug: true, updatedAt: true },
        orderBy: { id: 'asc' },
        skip: page * pageSize,
        take: pageSize,
      }),
      page === 0 ? this.prisma.business.count({ where }) : Promise.resolve(-1),
    ]);
    return { slugs, total };
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
  }): Promise<PaginatedDto<BusinessSummaryDto>> {
    const radiusMeters = (query.radiusKm ?? 25) * 1000;
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.longitude}::double precision, ${query.latitude}::double precision), 4326)::geography`;
    const term = query.q?.trim();

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
        Prisma.sql`ST_DWithin(b."geo", ${point}, ${radiusMeters})`,
        query.pincode ? Prisma.sql`b."pincodeCode" = ${query.pincode}` : Prisma.sql`TRUE`,
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
      .map((business) => this.toSummary(business, distanceById.get(business.id)));
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

  async getBySlug(slug: string, viewerId?: string): Promise<BusinessDetailDto> {
    const business = await this.prisma.business.findFirst({
      where: { slug, deletedAt: null, isActive: true },
      include: BUSINESS_INCLUDE,
    });
    if (!business) throw new NotFoundException('Business not found');

    // An owner opening their workspace is maintenance, not customer interest.
    // Best-effort for real visitors — a counter failure must never break the profile.
    if (viewerId !== business.ownerId) {
      await this.prisma.business
        .update({ where: { id: business.id }, data: { viewCount: { increment: 1 } } })
        .catch(() => undefined);
    }

    return this.toDetail(business, viewerId);
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
   * Slugs include the city because "sri lakshmi electronics" exists in every town in
   * the state. A numeric suffix is only added if that is still taken.
   */
  private async uniqueSlug(name: string, cityName: string): Promise<string> {
    const base = `${slugify(name)}-${slugify(cityName)}`;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.business.findUnique({ where: { slug: candidate } });
      if (!taken) return candidate;
    }

    return `${base}-${Date.now().toString(36)}`;
  }

  private toSummary(business: BusinessRow, distanceMeters?: number): BusinessSummaryDto {
    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      businessType: business.businessType,
      categoryName: business.category.name,
      cityName: business.city.name,
      pincode: business.pincodeCode ?? null,
      ...(distanceMeters !== undefined ? { distanceMeters: Math.round(distanceMeters) } : {}),
      logoUrl: business.logoMediaId ? this.storage.publicUrl(business.logoMediaId) : null,
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

  private toDetail(business: BusinessRow, viewerId?: string): BusinessDetailDto {
    const described = describeBusiness({
      categoryName: business.category.name,
      // The locality is not on the row shape this mapper receives; the city is enough to
      // place a business, and the full address is rendered separately anyway.
      localityName: null,
      cityName: business.city.name,
      keywords: business.keywords,
      description: business.description,
    });

    return {
      ...this.toSummary(business),
      // An imported record has no description of its own, so one is composed from what the
      // record actually holds. Never stored: it is a view of the business, not a fact about
      // it, and the day somebody claims the shop their words simply replace it.
      description: described.text,
      descriptionIsGenerated: described.generated,
      attribution: attributionFor(business),
      scale: business.scale,
      offering: business.offering,
      keywords: business.keywords,
      addressLine: business.address?.line1 ?? null,
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
