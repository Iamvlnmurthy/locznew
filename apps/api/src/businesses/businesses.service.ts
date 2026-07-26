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

  async create(userId: string, dto: CreateBusinessDto): Promise<BusinessDetailDto> {
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
          slug,
          categoryId: dto.categoryId,
          cityId: dto.cityId,
          addressId,
          description: dto.description,
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

    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
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

  private toSummary(business: BusinessRow): BusinessSummaryDto {
    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      categoryName: business.category.name,
      cityName: business.city.name,
      logoUrl: business.logoMediaId ? this.storage.publicUrl(business.logoMediaId) : null,
      verificationStatus: business.verificationStatus,
      listingCount: business._count.listings,
      viewCount: business.viewCount,
      description: business.description,
      addressLine: business.address?.line1 ?? null,
      hours: business.hours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        isClosed: hour.isClosed,
      })),
    };
  }

  private toDetail(business: BusinessRow, viewerId?: string): BusinessDetailDto {
    return {
      ...this.toSummary(business),
      description: business.description,
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
