import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ListingStatus, MediaStatus, NotificationType, UserStatus } from '@prisma/client';
import { Job } from 'bullmq';
import {
  JOB_ANONYMISE_DELETED_ACCOUNTS,
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
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexPublisher } from '../search/search-index.publisher';
import { StorageService } from '../media/storage.service';

/**
 * Scheduled housekeeping. Every job here is idempotent and bounded — each one is backed
 * by a partial index so it scans only rows that can actually be due, not the whole table.
 */
/**
 * How long a deletion request is held before the account is anonymised.
 *
 * Long enough that somebody who changed their mind can sign in and reverse it — signing in
 * restores a DELETION_REQUESTED account — and long enough to cover the dispute window on a
 * report or a conversation the account is part of.
 */
const RETENTION_DAYS = 30;

@Processor(QUEUE_LIFECYCLE, { concurrency: 1 })
export class LifecycleProcessor extends WorkerHost {
  private readonly logger = new Logger(LifecycleProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchIndex: SearchIndexPublisher,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly moderation: ModerationService,
    private readonly audit: AuditService,
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
      case JOB_ANONYMISE_DELETED_ACCOUNTS:
        return this.anonymiseDeletedAccounts();
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
      where: {
        // PENDING_UPLOAD is an upload that never arrived. QUARANTINED and SCANNING are
        // uploads that arrived and whose processing died — a restart mid-`confirmUpload`
        // leaves one in either state forever, holding a slot against the listing's image
        // limit and an object in the bucket, with nothing to move it on.
        status: {
          in: [MediaStatus.PENDING_UPLOAD, MediaStatus.QUARANTINED, MediaStatus.SCANNING],
        },
        createdAt: { lt: cutoff },
      },
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
   * index cost.
   *
   * Only users who are actually over the cap are touched. The previous statement ranked every
   * row in the table in one window function — which is the global scan its own comment said it
   * was avoiding, and the only job here without a bound on the work it does. Narrowing to the
   * offenders first means a table of ten million rows with fifty users over the limit costs
   * fifty deletes, and the `(userId, viewedAt DESC)` index answers each one.
   */
  private async trimRecentlyViewed(): Promise<{ removed: number }> {
    const KEEP_PER_USER = 200;
    const USERS_PER_RUN = 500;

    const over = await this.prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT "userId"
      FROM "recently_viewed"
      GROUP BY "userId"
      HAVING COUNT(*) > ${KEEP_PER_USER}
      LIMIT ${USERS_PER_RUN}
    `;

    if (over.length === 0) return { removed: 0 };

    let removed = 0;
    for (const { userId } of over) {
      removed += await this.prisma.$executeRaw`
        DELETE FROM "recently_viewed"
        WHERE "id" IN (
          SELECT "id"
          FROM "recently_viewed"
          WHERE "userId" = ${userId}::uuid
          ORDER BY "viewedAt" DESC
          OFFSET ${KEEP_PER_USER}
        )
      `;
    }

    if (removed > 0) {
      this.logger.log(`Trimmed ${removed} recently-viewed rows across ${over.length} user(s)`);
    }
    return { removed };
  }

  /**
   * Anonymises accounts whose deletion request has served out the retention window.
   *
   * `UsersService.requestDeletion` has described this job since it was written and it did not
   * exist, so "deletion is a request, not an immediate purge" was true only in the first half:
   * the request was recorded and the purge never came. Accounts kept their number, address and
   * name indefinitely.
   *
   * Anonymised rather than deleted, because the rows are referenced by reports, moderation
   * history and conversations that have to stay coherent — a dispute cannot be reconstructed
   * against a dangling id. What goes is everything that identifies a person: the number, the
   * address, the name, the bio, the password and every device token. What stays is a row with
   * an id, which is the minimum the rest of the schema needs.
   *
   * Thirty days, matching the refresh-token lifetime and the window in which a person who
   * changed their mind can still sign in and reverse it.
   */
  private async anonymiseDeletedAccounts(): Promise<{ anonymised: number }> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const due = await this.prisma.user.findMany({
      where: {
        status: UserStatus.DELETION_REQUESTED,
        deletionRequestedAt: { not: null, lte: cutoff },
        deletedAt: null,
      },
      select: { id: true },
      take: 200,
    });

    if (due.length === 0) return { anonymised: 0 };

    for (const { id } of due) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id },
          data: {
            // Null rather than a placeholder: the columns are unique, and a shared sentinel
            // would make the second anonymisation fail.
            phoneE164: null,
            email: null,
            passwordHash: null,
            bio: null,
            avatarMediaId: null,
            displayName: 'Deleted account',
            phoneVerifiedAt: null,
            emailVerifiedAt: null,
            deletedAt: new Date(),
          },
        }),
        // A push token is a live channel to a device belonging to somebody who asked to be
        // forgotten.
        this.prisma.device.updateMany({
          where: { userId: id },
          data: { pushToken: null, revokedAt: new Date() },
        }),
      ]);

      await this.audit.record({
        action: 'user.anonymise',
        entityType: 'User',
        entityId: id,
        actorRole: 'SYSTEM',
        changes: { retentionDays: RETENTION_DAYS },
      });
    }

    this.logger.log(`Anonymised ${due.length} account(s) past the retention window`);
    return { anonymised: due.length };
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
