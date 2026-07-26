import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ListingStatus, MediaStatus, NotificationType } from '@prisma/client';
import { Job } from 'bullmq';
import {
  JOB_EXPIRE_LISTINGS,
  JOB_SWEEP_ORPHAN_MEDIA,
  JOB_SWEEP_SESSIONS,
  JOB_LIFT_EXPIRED_SUSPENSIONS,
  JOB_TRIM_RECENTLY_VIEWED,
  JOB_WARN_EXPIRING,
  QUEUE_LIFECYCLE,
} from '../queue/queue.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService } from '../moderation/moderation.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexPublisher } from '../search/search-index.publisher';
import { StorageService } from '../media/storage.service';

/**
 * Scheduled housekeeping. Every job here is idempotent and bounded — each one is backed
 * by a partial index so it scans only rows that can actually be due, not the whole table.
 */
@Processor(QUEUE_LIFECYCLE, { concurrency: 1 })
export class LifecycleProcessor extends WorkerHost {
  private readonly logger = new Logger(LifecycleProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchIndex: SearchIndexPublisher,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly moderation: ModerationService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_EXPIRE_LISTINGS:
        return this.expireListings();
      case JOB_WARN_EXPIRING:
        return this.warnExpiring();
      case JOB_SWEEP_ORPHAN_MEDIA:
        return this.sweepOrphanMedia();
      case JOB_SWEEP_SESSIONS:
        return this.sweepSessions();
      case JOB_LIFT_EXPIRED_SUSPENSIONS:
        return this.moderation.liftExpiredSuspensions();
      case JOB_TRIM_RECENTLY_VIEWED:
        return this.trimRecentlyViewed();
      default:
        this.logger.error(`Unknown job "${job.name}" on the ${QUEUE_LIFECYCLE} queue`);
        return undefined;
    }
  }

  /**
   * Expires listings whose window has passed. Handled in batches so a backlog after
   * downtime cannot hold one long transaction open.
   */
  private async expireListings(): Promise<{ expired: number }> {
    const due = await this.prisma.listing.findMany({
      where: {
        status: ListingStatus.PUBLISHED,
        expiresAt: { lte: new Date() },
        deletedAt: null,
      },
      select: { id: true, ownerId: true, title: true },
      take: 500,
    });

    if (due.length === 0) return { expired: 0 };

    await this.prisma.listing.updateMany({
      where: { id: { in: due.map((listing) => listing.id) } },
      data: { status: ListingStatus.EXPIRED },
    });

    for (const listing of due) {
      await this.searchIndex.enqueueIndex(listing.id);
      await this.notifications.create({
        userId: listing.ownerId,
        type: NotificationType.LISTING_EXPIRED,
        title: 'Your listing has expired',
        body: `"${listing.title}" is no longer visible. Republish it in one tap.`,
        data: { entityType: 'Listing', entityId: listing.id, route: `/listings/${listing.id}` },
      });
    }

    this.logger.log(`Expired ${due.length} listings`);
    return { expired: due.length };
  }

  /**
   * Warns owners before expiry. Republishing is one tap, so the warning is what keeps
   * genuine inventory alive rather than silently vanishing.
   */
  private async warnExpiring(): Promise<{ warned: number }> {
    const rules = await this.prisma.expiryRule.findMany({ where: { isActive: true } });
    let warned = 0;

    for (const rule of rules) {
      if (rule.days <= 0) continue;

      const windowStart = new Date();
      const windowEnd = new Date(Date.now() + rule.warnBeforeDays * 24 * 60 * 60 * 1000);

      const due = await this.prisma.listing.findMany({
        where: {
          type: rule.listingType,
          status: ListingStatus.PUBLISHED,
          deletedAt: null,
          expiresAt: { gt: windowStart, lte: windowEnd },
        },
        select: { id: true, ownerId: true, title: true, expiresAt: true },
        take: 500,
      });

      for (const listing of due) {
        // The notification service de-duplicates on (user, type, entity), so re-running
        // this job daily does not nag the same person repeatedly.
        const created = await this.notifications.createOnce({
          userId: listing.ownerId,
          type: NotificationType.LISTING_EXPIRING,
          title: 'Your listing expires soon',
          body: `"${listing.title}" expires in ${rule.warnBeforeDays} day(s). Republish to keep it live.`,
          data: { entityType: 'Listing', entityId: listing.id, route: `/listings/${listing.id}` },
        });
        if (created) warned += 1;
      }
    }

    return { warned };
  }

  /**
   * Removes upload records that were requested but never confirmed, and the objects
   * behind them. Without this, abandoned posting flows accumulate storage cost forever.
   */
  private async sweepOrphanMedia(): Promise<{ removed: number }> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const orphans = await this.prisma.listingMedia.findMany({
      where: { status: MediaStatus.PENDING_UPLOAD, createdAt: { lt: cutoff } },
      take: 500,
    });

    for (const media of orphans) {
      await this.storage.delete(media.storageKey);
    }

    if (orphans.length > 0) {
      await this.prisma.listingMedia.deleteMany({
        where: { id: { in: orphans.map((media) => media.id) } },
      });
      this.logger.log(`Swept ${orphans.length} unconfirmed uploads`);
    }

    return { removed: orphans.length };
  }

  /**
   * Caps each user's viewing history.
   *
   * `RecentlyViewed` holds one row per distinct listing a user has opened and is never
   * pruned by the read path, so an active user accumulates rows indefinitely. Only the
   * most recent handful are ever displayed, so anything past the cap is pure storage and
   * index cost. Done in one statement per user rather than a global scan so the job stays
   * bounded regardless of table size.
   */
  private async trimRecentlyViewed(): Promise<{ removed: number }> {
    const KEEP_PER_USER = 200;

    const removed = await this.prisma.$executeRaw`
      DELETE FROM "recently_viewed"
      WHERE "id" IN (
        SELECT "id" FROM (
          SELECT "id",
                 ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "viewedAt" DESC) AS position
          FROM "recently_viewed"
        ) ranked
        WHERE ranked.position > ${KEEP_PER_USER}
      )
    `;

    if (removed > 0) {
      this.logger.log(`Trimmed ${removed} recently-viewed rows`);
    }
    return { removed };
  }

  /** Expired and revoked sessions have no further purpose; keeping them only grows the table. */
  private async sweepSessions(): Promise<{ removed: number }> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }],
      },
    });

    return { removed: result.count };
  }
}
