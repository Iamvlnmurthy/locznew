import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Listing,
  ListingStatus,
  ListingType,
  MediaStatus,
  ModerationDecision,
  ModerationStatus,
  ReportTargetType,
  UserStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v7 as uuid } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexPublisher } from '../search/search-index.publisher';
import {
  JOB_MATCH_REQUIREMENT_SELLERS,
  JOB_MATCH_SAVED_SEARCHES,
  QUEUE_REQUIREMENTS,
  QUEUE_SAVED_SEARCHES,
} from '../queue/queue.constants';
import { ModerationMediaQueueItemDto, ModerationQueueItemDto } from './dto/moderation.dto';
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
    private readonly tokens: TokenService,
    @InjectQueue(QUEUE_SAVED_SEARCHES) private readonly savedSearches: Queue,
    @InjectQueue(QUEUE_REQUIREMENTS) private readonly requirementMatches: Queue,
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

    const [ownerPublishedCount, duplicate, category] = await Promise.all([
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
      // Only the slug, so a rule can be stricter about medicines than about furniture.
      this.prisma.category.findUnique({
        where: { id: listing.categoryId },
        select: { slug: true },
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
      categorySlug: category?.slug ?? null,
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

  /**
   * Quarantined images waiting for a person.
   *
   * There was no way to find one. `moderation/queue` counts a listing's images and does not
   * name them; `listings/:id/media` deliberately returns only READY media, because it is the
   * public read. Preview, approve and block all take a media id, so the console had three
   * working controls and nothing to point them at — which is why every quarantined image
   * stayed quarantined even after the release route shipped.
   *
   * `LEGAL_HOLD` is excluded, not merely absent. Held evidence belongs to the restricted
   * child-safety case flow, where access is logged and justified; surfacing it in the
   * ordinary queue would route it to moderators who have `listing:moderate` and nothing
   * more, and hand them a preview URL for it.
   */
  async getMediaQueue(
    page: number,
    limit: number,
  ): Promise<{ items: ModerationMediaQueueItemDto[]; total: number }> {
    const where = {
      status: MediaStatus.REVIEW_REQUIRED,
      listing: { deletedAt: null },
    };

    const [media, total] = await Promise.all([
      this.prisma.listingMedia.findMany({
        where,
        select: {
          id: true,
          listingId: true,
          failureReason: true,
          createdAt: true,
          listing: { select: { title: true, owner: { select: { displayName: true } } } },
        },
        // Oldest first. A queue worked newest-first leaves its oldest items untouched
        // forever, and those are the uploads somebody has already been waiting on.
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.listingMedia.count({ where }),
    ]);

    const items: ModerationMediaQueueItemDto[] = media.map((entry) => ({
      id: entry.id,
      listingId: entry.listingId,
      listingTitle: entry.listing.title,
      uploaderName: entry.listing.owner.displayName,
      failureReason: entry.failureReason,
      createdAt: entry.createdAt,
    }));

    return { items, total };
  }

  /** Human approval from the moderation queue. */
  async approveListing(
    listingId: string,
    moderatorId: string | null,
    note?: string,
  ): Promise<Listing> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    if (listing.status === ListingStatus.PUBLISHED) {
      return listing; // already approved — treat as idempotent rather than an error
    }

    // Publishing and recording why must succeed or fail together. Run separately, a failure
    // in between leaves a listing live with nothing in its moderation history explaining how
    // it got there — which is exactly what happened the first time this was called with an
    // invalid moderator id: the listing published, the record did not, and the listing was
    // both unexplained and, because the enqueue never ran, unfindable.
    const updated = await this.prisma.$transaction(async (tx) => {
      const published = await tx.listing.update({
        where: { id: listingId },
        data: {
          status: ListingStatus.PUBLISHED,
          moderationStatus: ModerationStatus.APPROVED,
          publishedAt: listing.publishedAt ?? new Date(),
          rejectionReason: null,
        },
      });
      await this.recordDecision(listingId, moderatorId, 'APPROVE', note, tx);
      return published;
    });

    // Outside the transaction: the index is a different system, and a queue that is briefly
    // unreachable should not undo an approval a moderator has already made. Reindexing is
    // recoverable; an approval silently rolled back is not.
    await this.searchIndex.enqueueIndex(listingId);

    // A moderator's approval is the moment this listing becomes new to everyone else, so it
    // is where the saved-search alerts belong for anything that was held for review. Same
    // reasoning as the index enqueue: a failure here is logged, never fatal.
    await this.savedSearches
      .add(
        JOB_MATCH_SAVED_SEARCHES,
        { listingId },
        { jobId: `saved-search-${listingId}`, removeOnComplete: true },
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Could not queue saved-search alerts for ${listingId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    // A requirement held for review becomes news to sellers only when a moderator lets it
    // through, which is here rather than at creation.
    if (updated.type === ListingType.BUYER_REQUIREMENT) {
      await this.requirementMatches
        .add(
          JOB_MATCH_REQUIREMENT_SELLERS,
          { listingId },
          { jobId: `requirement-${listingId}`, removeOnComplete: true },
        )
        .catch((error: unknown) => {
          this.logger.error(
            `Could not queue seller alerts for requirement ${listingId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }

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

  /**
   * Suspends an account.
   *
   * Removing someone's listings does not stop them posting more, and until now that was
   * the only tool a moderator had: `user:suspend` was granted to the role, the account
   * status existed, sign-in refused a suspended user — and nothing could set the status.
   * The dashboard even counted suspended users, of which there could never be any.
   *
   * Sessions are revoked in the same breath. Sign-in checks the status, but a live access
   * token would otherwise keep working until it expired, so the person being suspended for
   * harassing someone would have another quarter of an hour to do it. A suspension that
   * takes effect later is not a suspension.
   *
   * Their listings are left alone deliberately: hiding an account's content is a separate
   * decision with its own audit trail, and conflating the two makes both harder to undo.
   */
  async suspendUser(
    userId: string,
    moderatorId: string,
    reason: string,
    durationDays?: number,
  ): Promise<{ suspended: true; sessionsRevoked: number; endsAt: Date | null }> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');

    if (user.id === moderatorId) {
      throw new BadRequestException('You cannot suspend your own account');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new ConflictException('That account is already suspended');
    }

    // Null means indefinite. Most suspensions should not be: a fortnight is a correction,
    // and a permanent ban for a first offence is a decision to lose a user rather than
    // teach one.
    const endsAt = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.SUSPENDED },
      }),
      this.prisma.userSuspension.create({
        data: { id: uuid(), userId, reason, issuedBy: moderatorId, endsAt },
      }),
    ]);

    const sessionsRevoked = await this.tokens.revokeAllForUser(userId, `suspended: ${reason}`);

    await this.audit.record({
      action: 'user.suspend',
      entityType: 'User',
      entityId: userId,
      actorId: moderatorId,
      changes: { reason, sessionsRevoked, endsAt },
    });

    this.logger.warn(
      `User ${userId} suspended by ${moderatorId} until ${endsAt?.toISOString() ?? 'further notice'}: ${reason}`,
    );
    return { suspended: true, sessionsRevoked, endsAt };
  }

  /**
   * Lifts suspensions whose term has run out.
   *
   * A suspension "for seven days" that nobody lifts is a permanent one with a misleading
   * label. The moderator who set it has moved on, and the person serving it has no way to
   * appeal a date that never arrives — so the system keeps the promise itself.
   */
  async liftExpiredSuspensions(): Promise<{ lifted: number }> {
    const due = await this.prisma.userSuspension.findMany({
      where: { liftedAt: null, endsAt: { not: null, lte: new Date() } },
      select: { id: true, userId: true },
    });

    if (due.length === 0) return { lifted: 0 };

    await this.prisma.$transaction([
      this.prisma.userSuspension.updateMany({
        where: { id: { in: due.map((row) => row.id) } },
        data: { liftedAt: new Date() },
      }),
      // Only accounts whose suspension is the reason they are suspended: someone
      // deactivated or pending deletion must stay as they are.
      this.prisma.user.updateMany({
        where: { id: { in: due.map((row) => row.userId) }, status: UserStatus.SUSPENDED },
        data: { status: UserStatus.ACTIVE },
      }),
    ]);

    this.logger.log(`Lifted ${due.length} expired suspension(s)`);
    return { lifted: due.length };
  }

  /**
   * Lifts a suspension. Sessions are not restored — the account signs in again, which is
   * both simpler and the behaviour anyone would expect after being locked out.
   */
  async reinstateUser(userId: string, moderatorId: string, reason: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');

    if (user.status !== UserStatus.SUSPENDED) {
      throw new ConflictException('That account is not suspended');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.ACTIVE },
      }),
      // Closing the record matters as much as changing the flag: an open suspension row
      // would otherwise be lifted a second time by the sweeper, and the history would show
      // a punishment that never ended.
      this.prisma.userSuspension.updateMany({
        where: { userId, liftedAt: null },
        data: { liftedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: 'user.reinstate',
      entityType: 'User',
      entityId: userId,
      actorId: moderatorId,
      changes: { reason },
    });

    this.logger.log(`User ${userId} reinstated by ${moderatorId}: ${reason}`);
  }

  /**
   * `moderatorId` is null when no person made the call — a maintenance run re-applying the
   * automated rules, for instance. That is exactly what `isAutomated` means, so the two are
   * derived from one another rather than being able to disagree: an action attributed to
   * nobody but marked as a human decision would misread the moderation history.
   */
  private async recordDecision(
    listingId: string,
    moderatorId: string | null,
    action: string,
    reason?: string,
    // The caller's transaction when there is one, so the decision and the state change it
    // describes cannot come apart.
    tx: Pick<PrismaService, 'moderationAction'> = this.prisma,
  ): Promise<void> {
    await tx.moderationAction.create({
      data: {
        id: uuid(),
        listingId,
        targetType: ReportTargetType.LISTING,
        targetId: listingId,
        action,
        reason: reason ?? null,
        systemReasons: [],
        isAutomated: moderatorId === null,
        moderatorId,
        appealStatus: 'NONE',
      },
    });

    await this.audit.record({
      action: `moderation.${action.toLowerCase()}`,
      entityType: 'Listing',
      entityId: listingId,
      actorId: moderatorId ?? undefined,
      // SYSTEM when nobody made the call, so the audit trail never implies a person did.
      actorRole: moderatorId === null ? 'SYSTEM' : 'MODERATOR',
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
