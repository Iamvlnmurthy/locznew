import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ContactPreference,
  Listing,
  ListingStatus,
  ListingType,
  ModerationStatus,
  Prisma,
  RoleName,
} from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { CategoriesService } from '../categories/categories.service';
import { PaginatedDto, paginate } from '../common/dto/pagination.dto';
import { listingSlug } from '../common/utils/slug.util';
import { RADIUS_PRESETS_KM } from '../geo/dto/geo.dto';
import { MediaService } from '../media/media.service';
import { ModerationService } from '../moderation/moderation.service';
import { GeoRepository } from '../prisma/geo.repository';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { SearchIndexPublisher } from '../search/search-index.publisher';
import {
  CreateListingDto,
  ListingDetailDto,
  ListingSearchQueryDto,
  ListingSummaryDto,
  MyListingsQueryDto,
  UpdateListingDto,
} from './dto/listing.dto';

/** Listing types that carry marketplace pricing details. */
const MARKETPLACE_TYPES: ListingType[] = [ListingType.PRODUCT, ListingType.CLASSIFIED];

const LISTING_SUMMARY_INCLUDE = {
  city: { select: { name: true } },
  locality: { select: { name: true } },
  marketplace: true,
  media: { where: { isPrimary: true }, take: 1 },
} satisfies Prisma.ListingInclude;

type ListingWithSummary = Prisma.ListingGetPayload<{ include: typeof LISTING_SUMMARY_INCLUDE }>;

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoRepository,
    private readonly categories: CategoriesService,
    private readonly moderation: ModerationService,
    private readonly media: MediaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly searchIndex: SearchIndexPublisher,
  ) {}

  // -------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------

  /**
   * Creates a listing and, unless saved as a draft, runs it through moderation
   * immediately so the poster learns straight away whether it is live or queued.
   */
  async create(
    userId: string,
    roles: string[],
    dto: CreateListingDto,
    context: { ip?: string; correlationId?: string },
  ): Promise<ListingDetailDto> {
    if (!dto.saveAsDraft) {
      await this.moderation.assertPostingAllowed(userId, roles);
    }

    const category = await this.categories.assertUsableFor(dto.categoryId, dto.type);
    if (dto.subcategoryId) {
      await this.categories.assertUsableFor(dto.subcategoryId, dto.type);
    }

    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId },
      include: { district: true, state: true },
    });
    if (!city) throw new BadRequestException('Select a valid city');

    if (dto.localityId) {
      const locality = await this.prisma.locality.findFirst({
        where: { id: dto.localityId, cityId: dto.cityId },
      });
      if (!locality)
        throw new BadRequestException('That locality does not belong to the selected city');
    }

    if (dto.businessId) {
      await this.assertCanPostForBusiness(userId, dto.businessId);
    }

    if (MARKETPLACE_TYPES.includes(dto.type) && !dto.marketplace) {
      throw new BadRequestException('Marketplace details are required for this listing type');
    }

    const attributeRows = await this.categories.buildAttributeValues(
      dto.subcategoryId ?? dto.categoryId,
      (dto.attributes ?? []).map((attribute) => ({ key: attribute.key, value: attribute.value })),
    );

    const price = dto.marketplace?.isFree ? 0 : (dto.marketplace?.price ?? null);
    const expiresAt = await this.computeExpiry(dto.type);

    const listing = await this.prisma.listing.create({
      data: {
        id: uuid(),
        type: dto.type,
        ownerId: userId,
        businessId: dto.businessId ?? null,
        title: dto.title.trim(),
        slug: listingSlug(dto.title),
        description: dto.description.trim(),
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId ?? null,
        status: ListingStatus.DRAFT,
        moderationStatus: dto.saveAsDraft
          ? ModerationStatus.NOT_REQUIRED
          : ModerationStatus.PENDING,
        cityId: city.id,
        districtId: city.districtId,
        stateId: city.stateId,
        localityId: dto.localityId ?? null,
        addressLine: dto.addressLine,
        // Coordinates fall back to the city centre so a listing is always placeable on a
        // map and always reachable by radius search, even when the poster skipped
        // precise location. The `geo` column is derived by trigger (ADR-0009).
        latitude: dto.latitude ?? city.latitude,
        longitude: dto.longitude ?? city.longitude,
        contactPreference: dto.contactPreference ?? ContactPreference.IN_APP_ONLY,
        showPhonePublicly: dto.showPhonePublicly ?? false,
        expiresAt,
        ...(dto.marketplace
          ? {
              marketplace: {
                create: {
                  price: price !== null ? new Prisma.Decimal(price) : null,
                  isNegotiable: dto.marketplace.isNegotiable ?? false,
                  isFree: dto.marketplace.isFree ?? false,
                  condition: dto.marketplace.condition,
                  isNewItem: dto.marketplace.condition === 'NEW',
                  brand: dto.marketplace.brand,
                  model: dto.marketplace.model,
                  purchaseYear: dto.marketplace.purchaseYear,
                  hasWarranty: dto.marketplace.hasWarranty ?? false,
                  warrantyDetails: dto.marketplace.warrantyDetails,
                  deliveryAvailable: dto.marketplace.deliveryAvailable ?? false,
                  pickupAvailable: dto.marketplace.pickupAvailable ?? true,
                  quantity: dto.marketplace.quantity ?? 1,
                },
              },
            }
          : {}),
        ...(attributeRows.length > 0
          ? { attributeValues: { createMany: { data: attributeRows } } }
          : {}),
      },
    });

    // Posting is what makes someone a seller — the role is granted on first use rather
    // than asked for at sign-up.
    if (!dto.saveAsDraft) {
      await this.rbac.ensureRole(userId, this.roleForListingType(dto.type));
    }

    await this.audit.record({
      action: 'listing.create',
      entityType: 'Listing',
      entityId: listing.id,
      actorId: userId,
      changes: {
        type: listing.type,
        categoryId: category.id,
        cityId: city.id,
        draft: Boolean(dto.saveAsDraft),
      },
      ip: context.ip,
      correlationId: context.correlationId,
    });

    if (!dto.saveAsDraft) {
      await this.moderation.screenListing(listing, price);
      // Moderation may have published it outright; the worker re-reads current state and
      // either indexes or skips accordingly.
      await this.searchIndex.enqueueIndex(listing.id);
    }

    return this.getByIdForOwner(listing.id, userId);
  }

  /** Submits a draft (or a rejected listing that has been edited) for review. */
  async submitForReview(
    listingId: string,
    userId: string,
    roles: string[],
  ): Promise<ListingDetailDto> {
    const listing = await this.requireOwned(listingId, userId);

    if (listing.status === ListingStatus.PUBLISHED) {
      throw new BadRequestException('This listing is already published');
    }

    await this.moderation.assertPostingAllowed(userId, roles);

    const marketplace = await this.prisma.marketplaceDetail.findUnique({
      where: { listingId },
    });

    await this.moderation.screenListing(
      listing,
      marketplace?.price ? Number(marketplace.price) : null,
    );
    await this.searchIndex.enqueueIndex(listingId);
    await this.rbac.ensureRole(userId, this.roleForListingType(listing.type));

    return this.getByIdForOwner(listingId, userId);
  }

  // -------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------

  /**
   * Public detail view. Increments the view count and records "recently viewed" for a
   * signed-in reader, both of which feed the home feed's recommendation rules.
   */
  async getBySlug(slug: string, viewerId?: string): Promise<ListingDetailDto> {
    const listing = await this.prisma.listing.findFirst({
      where: { slug, deletedAt: null },
      include: {
        ...LISTING_SUMMARY_INCLUDE,
        category: { select: { id: true, name: true } },
        owner: { select: { id: true, displayName: true, createdAt: true, phoneE164: true } },
        attributeValues: { include: { attribute: true } },
      },
    });

    if (!listing) throw new NotFoundException('Listing not found');

    const isOwner = viewerId === listing.ownerId;
    // Anything not published is visible only to its owner — a rejected or paused
    // listing must not stay reachable through its shared URL.
    if (listing.status !== ListingStatus.PUBLISHED && !isOwner) {
      throw new NotFoundException('Listing not found');
    }

    if (!isOwner) {
      await this.recordView(listing.id, viewerId);
    }

    return this.toDetailDto(listing, viewerId);
  }

  async getByIdForOwner(listingId: string, userId: string): Promise<ListingDetailDto> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, ownerId: userId, deletedAt: null },
      include: {
        ...LISTING_SUMMARY_INCLUDE,
        category: { select: { id: true, name: true } },
        owner: { select: { id: true, displayName: true, createdAt: true, phoneE164: true } },
        attributeValues: { include: { attribute: true } },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    return this.toDetailDto(listing, userId);
  }

  /**
   * Database-backed search. Meilisearch serves keyword queries; this path handles
   * structured browse (category, city, price, radius) and is the fallback whenever the
   * index is unavailable — the database stays the source of truth (ADR-0005).
   */
  async search(
    query: ListingSearchQueryDto,
    viewerId?: string,
  ): Promise<PaginatedDto<ListingSummaryDto>> {
    const wantsNearby =
      query.latitude !== undefined && query.longitude !== undefined && query.radiusKm !== undefined;

    if (
      wantsNearby &&
      !RADIUS_PRESETS_KM.includes(query.radiusKm as (typeof RADIUS_PRESETS_KM)[number])
    ) {
      throw new BadRequestException(`radiusKm must be one of ${RADIUS_PRESETS_KM.join(', ')}`);
    }

    // Radius search resolves ids through PostGIS first, then hydrates through Prisma so
    // one mapping and one visibility rule serve both paths.
    if (wantsNearby) {
      const rows = await this.geo.findNearbyListings({
        latitude: query.latitude!,
        longitude: query.longitude!,
        radiusMeters: query.radiusKm! * 1000,
        types: query.type ? [query.type] : undefined,
        categoryIds: query.categoryId ? [query.categoryId] : undefined,
        limit: query.limit,
        offset: query.skip,
      });

      const distanceById = new Map(rows.map((row) => [row.id, row.distanceMeters]));
      const listings = await this.prisma.listing.findMany({
        where: { id: { in: rows.map((row) => row.id) } },
        include: LISTING_SUMMARY_INCLUDE,
      });

      const total = await this.geo.countNearbyListings(
        query.latitude!,
        query.longitude!,
        query.radiusKm! * 1000,
      );

      const savedIds = await this.savedIdsFor(
        viewerId,
        listings.map((listing) => listing.id),
      );
      const items = listings
        .map((listing) => ({
          ...this.toSummaryDto(listing, savedIds),
          distanceMeters: Math.round(distanceById.get(listing.id) ?? 0),
        }))
        .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));

      return paginate(items, total, query.page, query.limit);
    }

    const where: Prisma.ListingWhereInput = {
      status: ListingStatus.PUBLISHED,
      deletedAt: null,
      visibility: 'PUBLIC',
      ...(query.type ? { type: query.type } : {}),
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.localityId ? { localityId: query.localityId } : {}),
      ...(query.categoryId
        ? { OR: [{ categoryId: query.categoryId }, { subcategoryId: query.categoryId }] }
        : {}),
      ...(query.priceMin !== undefined || query.priceMax !== undefined || query.condition
        ? {
            marketplace: {
              ...(query.condition ? { condition: query.condition } : {}),
              ...(query.priceMin !== undefined || query.priceMax !== undefined
                ? {
                    price: {
                      ...(query.priceMin !== undefined
                        ? { gte: new Prisma.Decimal(query.priceMin) }
                        : {}),
                      ...(query.priceMax !== undefined
                        ? { lte: new Prisma.Decimal(query.priceMax) }
                        : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
    };

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: LISTING_SUMMARY_INCLUDE,
        // Featured placement outranks recency but never relevance filters — a paid
        // boost moves a listing up the page, it does not put it in the wrong category.
        orderBy: [{ isFeatured: 'desc' }, ...this.orderFor(query.sort)],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.listing.count({ where }),
    ]);

    const savedIds = await this.savedIdsFor(
      viewerId,
      listings.map((listing) => listing.id),
    );
    return paginate(
      listings.map((listing) => this.toSummaryDto(listing, savedIds)),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Loads summaries for an explicit id set — how search results are hydrated after
   * Meilisearch has done the ranking. Visibility is re-checked here, so an index that is
   * momentarily ahead of the database cannot surface a listing that is no longer live.
   */
  async findSummariesByIds(ids: string[], viewerId?: string): Promise<ListingSummaryDto[]> {
    if (ids.length === 0) return [];

    const listings = await this.prisma.listing.findMany({
      where: {
        id: { in: ids },
        status: ListingStatus.PUBLISHED,
        deletedAt: null,
        visibility: 'PUBLIC',
      },
      include: LISTING_SUMMARY_INCLUDE,
    });

    const savedIds = await this.savedIdsFor(viewerId, ids);
    return listings.map((listing) => this.toSummaryDto(listing, savedIds));
  }

  async listMine(
    userId: string,
    query: MyListingsQueryDto,
  ): Promise<PaginatedDto<ListingSummaryDto>> {
    const where: Prisma.ListingWhereInput = {
      ownerId: userId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: LISTING_SUMMARY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return paginate(
      listings.map((listing) => this.toSummaryDto(listing, new Set())),
      total,
      query.page,
      query.limit,
    );
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  async update(
    listingId: string,
    userId: string,
    dto: UpdateListingDto,
    roles: string[],
  ): Promise<ListingDetailDto> {
    const listing = await this.requireOwned(listingId, userId);

    if (listing.status === ListingStatus.REMOVED) {
      throw new ForbiddenException('This listing was removed by a moderator and cannot be edited');
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        addressLine: dto.addressLine,
        latitude: dto.latitude,
        longitude: dto.longitude,
        contactPreference: dto.contactPreference,
        showPhonePublicly: dto.showPhonePublicly,
        localityId: dto.localityId,
        ...(dto.marketplace
          ? {
              marketplace: {
                update: {
                  price:
                    dto.marketplace.price !== undefined
                      ? new Prisma.Decimal(dto.marketplace.price)
                      : undefined,
                  isNegotiable: dto.marketplace.isNegotiable,
                  isFree: dto.marketplace.isFree,
                  condition: dto.marketplace.condition,
                  brand: dto.marketplace.brand,
                  model: dto.marketplace.model,
                  deliveryAvailable: dto.marketplace.deliveryAvailable,
                  pickupAvailable: dto.marketplace.pickupAvailable,
                  quantity: dto.marketplace.quantity,
                },
              },
            }
          : {}),
      },
    });

    await this.audit.record({
      action: 'listing.update',
      entityType: 'Listing',
      entityId: listingId,
      actorId: userId,
      changes: this.audit.diff(
        { title: listing.title, description: listing.description },
        { title: updated.title, description: updated.description },
      ),
    });

    // Editing the words is exactly how a rejected listing gets laundered into an
    // approved one, so any content change on a live listing re-enters moderation.
    const contentChanged = dto.title !== undefined || dto.description !== undefined;
    if (contentChanged && listing.status === ListingStatus.PUBLISHED) {
      const marketplace = await this.prisma.marketplaceDetail.findUnique({ where: { listingId } });
      await this.moderation.screenListing(
        updated,
        marketplace?.price ? Number(marketplace.price) : null,
      );
    }

    // Any edit changes the indexed document, whether or not it re-entered moderation.
    await this.searchIndex.enqueueIndex(listingId);

    void roles;
    return this.getByIdForOwner(listingId, userId);
  }

  async pause(listingId: string, userId: string): Promise<Listing> {
    const listing = await this.requireOwned(listingId, userId);
    if (listing.status !== ListingStatus.PUBLISHED) {
      throw new BadRequestException('Only a published listing can be paused');
    }
    return this.transition(listingId, userId, ListingStatus.PAUSED, 'listing.pause');
  }

  async resume(listingId: string, userId: string): Promise<Listing> {
    const listing = await this.requireOwned(listingId, userId);
    if (listing.status !== ListingStatus.PAUSED) {
      throw new BadRequestException('Only a paused listing can be resumed');
    }
    return this.transition(listingId, userId, ListingStatus.PUBLISHED, 'listing.resume');
  }

  async markSold(listingId: string, userId: string): Promise<Listing> {
    const listing = await this.requireOwned(listingId, userId);
    const liveStatuses: ListingStatus[] = [ListingStatus.PUBLISHED, ListingStatus.PAUSED];
    if (!liveStatuses.includes(listing.status)) {
      throw new BadRequestException('Only a live listing can be marked as sold');
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.SOLD, soldAt: new Date() },
    });

    // A sold item leaves search immediately — nothing is more annoying than results
    // that are already gone.
    await this.searchIndex.enqueueIndex(listingId);

    await this.audit.record({
      action: 'listing.mark_sold',
      entityType: 'Listing',
      entityId: listingId,
      actorId: userId,
    });

    return updated;
  }

  /** Republishes an expired listing with a fresh expiry, re-running moderation. */
  async republish(listingId: string, userId: string, roles: string[]): Promise<ListingDetailDto> {
    const listing = await this.requireOwned(listingId, userId);

    const republishable: ListingStatus[] = [
      ListingStatus.EXPIRED,
      ListingStatus.SOLD,
      ListingStatus.PAUSED,
    ];
    if (!republishable.includes(listing.status)) {
      throw new BadRequestException('Only an expired, sold or paused listing can be republished');
    }

    await this.moderation.assertPostingAllowed(userId, roles);

    const expiresAt = await this.computeExpiry(listing.type);
    const refreshed = await this.prisma.listing.update({
      where: { id: listingId },
      data: { expiresAt, soldAt: null, publishedAt: null },
    });

    const marketplace = await this.prisma.marketplaceDetail.findUnique({ where: { listingId } });
    await this.moderation.screenListing(
      refreshed,
      marketplace?.price ? Number(marketplace.price) : null,
    );
    await this.searchIndex.enqueueIndex(listingId);

    await this.audit.record({
      action: 'listing.republish',
      entityType: 'Listing',
      entityId: listingId,
      actorId: userId,
    });

    return this.getByIdForOwner(listingId, userId);
  }

  /**
   * Soft delete. The row survives so reports, conversations and moderation history
   * involving this listing remain coherent.
   */
  async remove(listingId: string, userId: string): Promise<void> {
    await this.requireOwned(listingId, userId);

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.ARCHIVED, deletedAt: new Date() },
    });

    await this.searchIndex.enqueueRemoval(listingId);

    await this.audit.record({
      action: 'listing.delete',
      entityType: 'Listing',
      entityId: listingId,
      actorId: userId,
    });
  }

  // -------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------

  async save(listingId: string, userId: string): Promise<{ saved: boolean; saveCount: number }> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null, status: ListingStatus.PUBLISHED },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.ownerId === userId) {
      throw new BadRequestException('You cannot save your own listing');
    }

    // The unique constraint makes this idempotent: saving twice is not an error, and
    // the counter only moves when a row is actually created.
    const existing = await this.prisma.savedListing.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    if (existing) {
      return { saved: true, saveCount: listing.saveCount };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.savedListing.create({ data: { id: uuid(), userId, listingId } }),
      this.prisma.listing.update({
        where: { id: listingId },
        data: { saveCount: { increment: 1 } },
      }),
    ]);

    return { saved: true, saveCount: updated.saveCount };
  }

  async unsave(listingId: string, userId: string): Promise<{ saved: boolean; saveCount: number }> {
    const existing = await this.prisma.savedListing.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    if (!existing) {
      const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
      return { saved: false, saveCount: listing?.saveCount ?? 0 };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.savedListing.delete({ where: { id: existing.id } }),
      this.prisma.listing.update({
        where: { id: listingId },
        // Guarded so a double-unsave cannot drive the counter negative.
        data: { saveCount: { decrement: 1 } },
      }),
    ]);

    return { saved: false, saveCount: Math.max(updated.saveCount, 0) };
  }

  async listSaved(
    userId: string,
    query: MyListingsQueryDto,
  ): Promise<PaginatedDto<ListingSummaryDto>> {
    const where: Prisma.SavedListingWhereInput = {
      userId,
      listing: { deletedAt: null },
    };

    const [saved, total] = await Promise.all([
      this.prisma.savedListing.findMany({
        where,
        include: { listing: { include: LISTING_SUMMARY_INCLUDE } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.savedListing.count({ where }),
    ]);

    const savedIds = new Set(saved.map((entry) => entry.listingId));
    return paginate(
      saved.map((entry) => this.toSummaryDto(entry.listing, savedIds)),
      total,
      query.page,
      query.limit,
    );
  }

  async listRecentlyViewed(userId: string, limit = 10): Promise<ListingSummaryDto[]> {
    const views = await this.prisma.recentlyViewed.findMany({
      where: { userId, listing: { deletedAt: null, status: ListingStatus.PUBLISHED } },
      include: { listing: { include: LISTING_SUMMARY_INCLUDE } },
      orderBy: { viewedAt: 'desc' },
      take: limit,
    });

    const savedIds = await this.savedIdsFor(
      userId,
      views.map((view) => view.listingId),
    );
    return views.map((view) => this.toSummaryDto(view.listing, savedIds));
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------

  private async requireOwned(listingId: string, userId: string): Promise<Listing> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.ownerId !== userId) throw new ForbiddenException('This is not your listing');
    return listing;
  }

  private async transition(
    listingId: string,
    userId: string,
    status: ListingStatus,
    action: string,
  ): Promise<Listing> {
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status },
    });
    await this.audit.record({
      action,
      entityType: 'Listing',
      entityId: listingId,
      actorId: userId,
    });
    await this.searchIndex.enqueueIndex(listingId);
    return updated;
  }

  private async assertCanPostForBusiness(userId: string, businessId: string): Promise<void> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      include: { staff: { where: { userId } } },
    });
    if (!business) throw new NotFoundException('Business not found');

    const isOwner = business.ownerId === userId;
    const staff = business.staff[0];
    const canPost = isOwner || (staff?.acceptedAt && staff.permissions.includes('listing:create'));

    if (!canPost) {
      throw new ForbiddenException('You do not have permission to post for this business');
    }
  }

  /** Expiry windows are configurable per listing type; 0 days means no auto-expiry. */
  private async computeExpiry(type: ListingType): Promise<Date | null> {
    const rule = await this.prisma.expiryRule.findUnique({ where: { listingType: type } });
    if (!rule || !rule.isActive || rule.days <= 0) return null;
    return new Date(Date.now() + rule.days * 24 * 60 * 60 * 1000);
  }

  private roleForListingType(type: ListingType): RoleName {
    switch (type) {
      case ListingType.JOB:
        return RoleName.EMPLOYER;
      case ListingType.SERVICE:
        return RoleName.SERVICE_PROVIDER;
      case ListingType.OFFER:
      case ListingType.BUSINESS_LISTING:
        return RoleName.BUSINESS_OWNER;
      default:
        return RoleName.INDIVIDUAL_SELLER;
    }
  }

  /**
   * View counting is best-effort and deliberately not transactional with the read —
   * a lost increment is irrelevant, a failed page load is not.
   */
  private async recordView(listingId: string, viewerId?: string): Promise<void> {
    try {
      await this.prisma.listing.update({
        where: { id: listingId },
        data: { viewCount: { increment: 1 } },
      });

      if (viewerId) {
        await this.prisma.recentlyViewed.upsert({
          where: { userId_listingId: { userId: viewerId, listingId } },
          update: { viewedAt: new Date() },
          create: { id: uuid(), userId: viewerId, listingId },
        });
      }
    } catch (error) {
      this.logger.warn(`Could not record view for ${listingId}: ${String(error)}`);
    }
  }

  private async savedIdsFor(
    viewerId: string | undefined,
    listingIds: string[],
  ): Promise<Set<string>> {
    if (!viewerId || listingIds.length === 0) return new Set();
    const saved = await this.prisma.savedListing.findMany({
      where: { userId: viewerId, listingId: { in: listingIds } },
      select: { listingId: true },
    });
    return new Set(saved.map((entry) => entry.listingId));
  }

  private orderFor(sort: ListingSearchQueryDto['sort']): Prisma.ListingOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
        return [{ marketplace: { price: 'asc' } }];
      case 'price_desc':
        return [{ marketplace: { price: 'desc' } }];
      case 'popular':
        return [{ viewCount: 'desc' }, { publishedAt: 'desc' }];
      case 'newest':
      default:
        return [{ publishedAt: 'desc' }];
    }
  }

  private toSummaryDto(listing: ListingWithSummary, savedIds: Set<string>): ListingSummaryDto {
    const primary = listing.media[0];
    return {
      id: listing.id,
      slug: listing.slug,
      type: listing.type,
      title: listing.title,
      status: listing.status,
      price: listing.marketplace?.price ? Number(listing.marketplace.price) : null,
      isNegotiable: listing.marketplace?.isNegotiable ?? false,
      cityName: listing.city.name,
      localityName: listing.locality?.name ?? null,
      thumbUrl: primary ? this.media.toDto(primary).thumbUrl : null,
      isFeatured: listing.isFeatured,
      viewCount: listing.viewCount,
      publishedAt: listing.publishedAt,
      ...(savedIds.size > 0 ? { isSaved: savedIds.has(listing.id) } : {}),
    };
  }

  private async toDetailDto(
    listing: ListingWithSummary & {
      category: { id: string; name: string };
      owner: { id: string; displayName: string; createdAt: Date; phoneE164: string };
      attributeValues: Array<{
        attribute: { key: string; label: string };
        valueText: string | null;
        valueNumber: Prisma.Decimal | null;
        valueBool: boolean | null;
        valueDate: Date | null;
        valueJson: Prisma.JsonValue | null;
      }>;
    },
    viewerId?: string,
  ): Promise<ListingDetailDto> {
    const savedIds = await this.savedIdsFor(viewerId, [listing.id]);
    const media = await this.media.listForListing(listing.id);

    const attributes: Record<string, unknown> = {};
    for (const value of listing.attributeValues) {
      attributes[value.attribute.key] =
        value.valueText ??
        (value.valueNumber !== null ? Number(value.valueNumber) : null) ??
        value.valueBool ??
        value.valueDate ??
        value.valueJson;
    }

    // The phone number is exposed only when the owner explicitly opted in — never by
    // default, and never merely because the viewer is signed in.
    const showPhone =
      listing.showPhonePublicly && listing.contactPreference !== ContactPreference.IN_APP_ONLY;

    return {
      ...this.toSummaryDto(listing, savedIds),
      isSaved: viewerId ? savedIds.has(listing.id) : undefined,
      description: listing.description,
      categoryId: listing.category.id,
      categoryName: listing.category.name,
      addressLine: listing.addressLine,
      latitude: listing.latitude ? Number(listing.latitude) : null,
      longitude: listing.longitude ? Number(listing.longitude) : null,
      contactPreference: listing.contactPreference,
      owner: {
        id: listing.owner.id,
        displayName: listing.owner.displayName,
        memberSince: listing.owner.createdAt,
        phone: showPhone ? (listing.contactPhone ?? listing.owner.phoneE164) : null,
      },
      media,
      attributes,
      marketplace: listing.marketplace
        ? {
            price: listing.marketplace.price ? Number(listing.marketplace.price) : null,
            isNegotiable: listing.marketplace.isNegotiable,
            isFree: listing.marketplace.isFree,
            condition: listing.marketplace.condition,
            brand: listing.marketplace.brand,
            model: listing.marketplace.model,
            purchaseYear: listing.marketplace.purchaseYear,
            hasWarranty: listing.marketplace.hasWarranty,
            deliveryAvailable: listing.marketplace.deliveryAvailable,
            pickupAvailable: listing.marketplace.pickupAvailable,
            quantity: listing.marketplace.quantity,
          }
        : null,
      expiresAt: listing.expiresAt,
      saveCount: listing.saveCount,
    };
  }
}
