import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Listing,
  ListingStatus,
  ModerationDecision,
  ModerationStatus,
  ReportTargetType,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { v7 as uuid } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexPublisher } from '../search/search-index.publisher';
import { ModerationQueueItemDto } from './dto/moderation.dto';
import {
  MODERATION_PROVIDER,
  ModerationProvider,
  ModerationVerdict,
} from './moderation-provider.interface';

export interface ModerationOutcome {
  status: ListingStatus;
  moderationStatus: ModerationStatus;
  verdict: ModerationVerdict;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @Inject(MODERATION_PROVIDER) private readonly provider: ModerationProvider,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly searchIndex: SearchIndexPublisher,
  ) {}

  /**
   * Normalised fingerprint used for duplicate detection. Whitespace, case and
   * punctuation are stripped so "iPhone 13 - 128GB!!" and "iphone 13 128gb" collide,
   * which is exactly the reposting pattern this is meant to catch.
   */
  fingerprint(ownerId: string, title: string, price: number | null | undefined): string {
    const normalised = title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    return createHash('sha256')
      .update(`${ownerId}:${normalised}:${price ?? ''}`)
      .digest('hex');
  }

  /**
   * Runs a new or edited listing through the provider and applies the outcome.
   * Called synchronously on submit: the poster must be told immediately whether their
   * listing is live, queued or rejected.
   */
  async screenListing(listing: Listing, price?: number | null): Promise<ModerationOutcome> {
    const duplicateHash = this.fingerprint(listing.ownerId, listing.title, price);

    const [ownerPublishedCount, duplicate] = await Promise.all([
      this.prisma.listing.count({
        where: { ownerId: listing.ownerId, status: ListingStatus.PUBLISHED, deletedAt: null },
      }),
      this.prisma.listing.findFirst({
        where: {
          duplicateHash,
          id: { not: listing.id },
          deletedAt: null,
          status: { in: [ListingStatus.PUBLISHED, ListingStatus.PENDING_REVIEW] },
        },
      }),
    ]);

    const verdict = await this.provider.evaluate({
      listingId: listing.id,
      ownerId: listing.ownerId,
      type: listing.type,
      title: listing.title,
      description: listing.description,
      price,
      contactPhone: listing.contactPhone,
      ownerPublishedCount,
      isDuplicate: Boolean(duplicate),
    });

    const outcome = this.applyVerdict(verdict);

    await this.prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: outcome.status,
        moderationStatus: outcome.moderationStatus,
        moderationScore: verdict.score,
        duplicateHash,
        publishedAt: outcome.status === ListingStatus.PUBLISHED ? new Date() : null,
        rejectionReason:
          outcome.status === ListingStatus.REJECTED
            ? 'This listing was blocked automatically. Reply to support if you believe this is wrong.'
            : null,
      },
    });

    await this.prisma.moderationAction.create({
      data: {
        id: uuid(),
        listingId: listing.id,
        targetType: ReportTargetType.LISTING,
        targetId: listing.id,
        action: this.actionNameFor(verdict.decision),
        systemReasons: verdict.reasons,
        isAutomated: true,
        reason: `${this.provider.name} score ${verdict.score}`,
      },
    });

    return { ...outcome, verdict };
  }

  private applyVerdict(verdict: ModerationVerdict): Omit<ModerationOutcome, 'verdict'> {
    switch (verdict.decision) {
      case ModerationDecision.AUTO_APPROVE:
        return { status: ListingStatus.PUBLISHED, moderationStatus: ModerationStatus.APPROVED };
      case ModerationDecision.AUTO_REJECT:
        return { status: ListingStatus.REJECTED, moderationStatus: ModerationStatus.REJECTED };
      case ModerationDecision.REVIEW:
      default:
        return { status: ListingStatus.PENDING_REVIEW, moderationStatus: ModerationStatus.PENDING };
    }
  }

  private actionNameFor(decision: ModerationDecision): string {
    return decision === ModerationDecision.AUTO_APPROVE
      ? 'APPROVE'
      : decision === ModerationDecision.AUTO_REJECT
        ? 'REJECT'
        : 'ESCALATE';
  }

  /**
   * The review queue, oldest first — a listing waiting since yesterday is more urgent
   * than one submitted a minute ago, and FIFO is what keeps the backlog honest.
   */
  async getQueue(
    page: number,
    limit: number,
  ): Promise<{ items: ModerationQueueItemDto[]; total: number }> {
    const where = { moderationStatus: ModerationStatus.PENDING, deletedAt: null };

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: {
          owner: { select: { id: true, displayName: true } },
          city: { select: { name: true } },
          category: { select: { name: true } },
          marketplace: { select: { price: true } },
          _count: { select: { media: true, reports: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.listing.count({ where }),
    ]);

    const ownerIds = [...new Set(listings.map((listing) => listing.ownerId))];
    const publishedCounts = await this.prisma.listing.groupBy({
      by: ['ownerId'],
      where: { ownerId: { in: ownerIds }, status: ListingStatus.PUBLISHED, deletedAt: null },
      _count: { _all: true },
    });
    const publishedByOwner = new Map(
      publishedCounts.map((entry) => [entry.ownerId, entry._count._all]),
    );

    // The automated reasons live on the most recent automated action for each listing.
    const actions = await this.prisma.moderationAction.findMany({
      where: { listingId: { in: listings.map((listing) => listing.id) }, isAutomated: true },
      orderBy: { createdAt: 'desc' },
    });
    const reasonsByListing = new Map<string, string[]>();
    for (const action of actions) {
      if (action.listingId && !reasonsByListing.has(action.listingId)) {
        reasonsByListing.set(action.listingId, action.systemReasons);
      }
    }

    const items: ModerationQueueItemDto[] = listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      type: listing.type,
      ownerId: listing.ownerId,
      ownerName: listing.owner.displayName,
      ownerPublishedCount: publishedByOwner.get(listing.ownerId) ?? 0,
      cityName: listing.city.name,
      categoryName: listing.category.name,
      price: listing.marketplace?.price ? Number(listing.marketplace.price) : null,
      moderationScore: listing.moderationScore,
      systemReasons: reasonsByListing.get(listing.id) ?? [],
      imageCount: listing._count.media,
      reportCount: listing._count.reports,
      createdAt: listing.createdAt,
    }));

    return { items, total };
  }

  /** Human approval from the moderation queue. */
  async approveListing(listingId: string, moderatorId: string, note?: string): Promise<Listing> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    if (listing.status === ListingStatus.PUBLISHED) {
      return listing; // already approved — treat as idempotent rather than an error
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status: ListingStatus.PUBLISHED,
        moderationStatus: ModerationStatus.APPROVED,
        publishedAt: listing.publishedAt ?? new Date(),
        rejectionReason: null,
      },
    });

    await this.recordDecision(listingId, moderatorId, 'APPROVE', note);
    // Approval is the moment a listing becomes discoverable.
    await this.searchIndex.enqueueIndex(listingId);
    return updated;
  }

  async rejectListing(listingId: string, moderatorId: string, reason: string): Promise<Listing> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status: ListingStatus.REJECTED,
        moderationStatus: ModerationStatus.REJECTED,
        rejectionReason: reason,
        publishedAt: null,
      },
    });

    await this.recordDecision(listingId, moderatorId, 'REJECT', reason);
    await this.searchIndex.enqueueRemoval(listingId);
    return updated;
  }

  /** Removal after publication — a reported listing that turned out to be abusive. */
  async removeListing(listingId: string, moderatorId: string, reason: string): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status: ListingStatus.REMOVED,
        moderationStatus: ModerationStatus.REJECTED,
        rejectionReason: reason,
      },
    });

    await this.recordDecision(listingId, moderatorId, 'REMOVE', reason);
    await this.searchIndex.enqueueRemoval(listingId);
  }

  private async recordDecision(
    listingId: string,
    moderatorId: string,
    action: string,
    reason?: string,
  ): Promise<void> {
    await this.prisma.moderationAction.create({
      data: {
        id: uuid(),
        listingId,
        targetType: ReportTargetType.LISTING,
        targetId: listingId,
        action,
        reason: reason ?? null,
        systemReasons: [],
        isAutomated: false,
        moderatorId,
        appealStatus: 'NONE',
      },
    });

    await this.audit.record({
      action: `moderation.${action.toLowerCase()}`,
      entityType: 'Listing',
      entityId: listingId,
      actorId: moderatorId,
      actorRole: 'MODERATOR',
      changes: { reason: reason ?? null },
    });
  }

  /**
   * Per-role daily posting cap. Free posting only stays viable if one account cannot
   * flood a city overnight.
   */
  async assertPostingAllowed(userId: string, roles: string[]): Promise<void> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'posting.limits.perRolePerDay' },
    });

    const limits = (setting?.value as Record<string, number> | undefined) ?? {
      REGISTERED_USER: 3,
    };

    // A user holding several roles gets the most generous applicable limit.
    const limit = Math.max(...roles.map((role) => limits[role] ?? 0), limits.REGISTERED_USER ?? 3);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const postedToday = await this.prisma.listing.count({
      where: { ownerId: userId, createdAt: { gte: since } },
    });

    if (postedToday >= limit) {
      throw new ForbiddenException(
        `You have reached your daily posting limit of ${limit}. Try again tomorrow.`,
      );
    }
  }
}
