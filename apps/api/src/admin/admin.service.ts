import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ListingStatus, ModerationStatus, ReportStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOB_EXPIRE_LISTINGS,
  JOB_SWEEP_ORPHAN_MEDIA,
  JOB_SWEEP_SESSIONS,
  JOB_LIFT_EXPIRED_SUSPENSIONS,
  JOB_TRIM_RECENTLY_VIEWED,
  JOB_WARN_EXPIRING,
  QUEUE_LIFECYCLE,
} from '../queue/queue.constants';
import { RedisService } from '../redis/redis.service';
import {
  AdminMetricsDto,
  AdminUserDto,
  AuditLogDto,
  ListingsByBucketDto,
  QueueHealthDto,
  TopListingDto,
} from './dto/admin.dto';

/**
 * Jobs an administrator may trigger by hand. Deliberately a fixed list rather than
 * anything the queue accepts: this endpoint takes a name from an HTTP request, and an
 * open-ended one would let a caller enqueue arbitrary job types.
 */
const RUNNABLE_JOBS: string[] = [
  JOB_EXPIRE_LISTINGS,
  JOB_WARN_EXPIRING,
  JOB_SWEEP_ORPHAN_MEDIA,
  JOB_SWEEP_SESSIONS,
  JOB_TRIM_RECENTLY_VIEWED,
  JOB_LIFT_EXPIRED_SUSPENSIONS,
];

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  /**
   * The business total, remembered for five minutes.
   *
   * Counting 4.2 million rows takes 2,494ms, against 44-48ms for every other
   * counter on this dashboard - users, listings and reports are all in single
   * or double figures. So one query was setting the load time for the whole
   * page, and it was the one number that barely moves: the directory grows by
   * an import every few weeks, not by the second.
   *
   * Five minutes rather than a day because an admin who has just run an import
   * will reasonably expect the figure to change, and rather than an approximate
   * count from pg_class.reltuples because a dashboard that disagrees with a
   * SELECT count(*) is a dashboard people stop trusting.
   */
  private businessTotalCache: { value: number; at: number } | null = null;

  private async businessTotal(): Promise<number> {
    const now = Date.now();
    if (this.businessTotalCache && now - this.businessTotalCache.at < 300_000) {
      return this.businessTotalCache.value;
    }
    const value = await this.prisma.business.count({ where: { deletedAt: null } });
    this.businessTotalCache = { value, at: now };
    return value;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue(QUEUE_LIFECYCLE) private readonly lifecycle: Queue,
  ) {}

  /**
   * Dashboard overview.
   *
   * Every count runs concurrently — the overview is the first screen a moderator opens
   * each morning, and a serial chain of a dozen counts would make it feel broken.
   */
  async getMetrics(): Promise<AdminMetricsDto> {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      activeUsersThisMonth,
      suspendedUsers,
      publishedListings,
      pendingListings,
      rejectedListings,
      expiredListings,
      listingsToday,
      openReports,
      totalBusinesses,
      verifiedBusinesses,
      openJobs,
      liveOffers,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { createdAt: { gte: dayAgo }, deletedAt: null } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: monthAgo }, deletedAt: null } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
      this.prisma.listing.count({ where: { status: ListingStatus.PUBLISHED, deletedAt: null } }),
      this.prisma.listing.count({
        where: { moderationStatus: ModerationStatus.PENDING, deletedAt: null },
      }),
      this.prisma.listing.count({ where: { status: ListingStatus.REJECTED, deletedAt: null } }),
      this.prisma.listing.count({ where: { status: ListingStatus.EXPIRED, deletedAt: null } }),
      this.prisma.listing.count({ where: { createdAt: { gte: dayAgo }, deletedAt: null } }),
      this.prisma.report.count({
        where: { status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW] } },
      }),
      this.businessTotal(),
      this.prisma.business.count({ where: { verificationStatus: 'VERIFIED', deletedAt: null } }),
      this.prisma.listing.count({
        where: { type: 'JOB', status: ListingStatus.PUBLISHED, deletedAt: null },
      }),
      this.prisma.listing.count({
        where: {
          type: 'OFFER',
          status: ListingStatus.PUBLISHED,
          deletedAt: null,
          offer: { endsAt: { gte: new Date() } },
        },
      }),
    ]);

    return {
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      activeUsersThisMonth,
      suspendedUsers,
      publishedListings,
      pendingListings,
      rejectedListings,
      expiredListings,
      listingsToday,
      openReports,
      totalBusinesses,
      verifiedBusinesses,
      openJobs,
      liveOffers,
    };
  }

  /** Listing volume by city — which markets are actually alive. */
  async getListingsByCity(limit = 10): Promise<ListingsByBucketDto[]> {
    const grouped = await this.prisma.listing.groupBy({
      by: ['cityId'],
      where: { status: ListingStatus.PUBLISHED, deletedAt: null },
      _count: { _all: true },
      orderBy: { _count: { cityId: 'desc' } },
      take: limit,
    });

    const cities = await this.prisma.city.findMany({
      where: { id: { in: grouped.map((entry) => entry.cityId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(cities.map((city) => [city.id, city.name]));

    return grouped.map((entry) => ({
      id: entry.cityId,
      label: nameById.get(entry.cityId) ?? 'Unknown',
      count: entry._count._all,
    }));
  }

  async getListingsByCategory(limit = 10): Promise<ListingsByBucketDto[]> {
    const grouped = await this.prisma.listing.groupBy({
      by: ['categoryId'],
      where: { status: ListingStatus.PUBLISHED, deletedAt: null },
      _count: { _all: true },
      orderBy: { _count: { categoryId: 'desc' } },
      take: limit,
    });

    const categories = await this.prisma.category.findMany({
      where: { id: { in: grouped.map((entry) => entry.categoryId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(categories.map((category) => [category.id, category.name]));

    return grouped.map((entry) => ({
      id: entry.categoryId,
      label: nameById.get(entry.categoryId) ?? 'Unknown',
      count: entry._count._all,
    }));
  }

  /** Daily listing counts for the last N days, zero-filled so the chart has no gaps. */
  async getDailyListings(days = 14): Promise<ListingsByBucketDto[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "listings"
      WHERE "createdAt" >= ${since} AND "deletedAt" IS NULL
      GROUP BY day
      ORDER BY day ASC
    `;

    const countByDay = new Map(
      rows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)]),
    );

    const buckets: ListingsByBucketDto[] = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      buckets.push({ id: date, label: date, count: countByDay.get(date) ?? 0 });
    }
    return buckets;
  }

  async getMostViewedListings(limit = 10): Promise<TopListingDto[]> {
    const listings = await this.prisma.listing.findMany({
      where: { status: ListingStatus.PUBLISHED, deletedAt: null },
      select: {
        id: true,
        title: true,
        slug: true,
        viewCount: true,
        saveCount: true,
        city: { select: { name: true } },
      },
      orderBy: { viewCount: 'desc' },
      take: limit,
    });

    return listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      slug: listing.slug,
      cityName: listing.city.name,
      viewCount: listing.viewCount,
      saveCount: listing.saveCount,
    }));
  }

  /**
   * Queue depth straight from Redis. A growing backlog here is the earliest warning
   * that indexing or notification delivery has stalled.
   */
  async getQueueHealth(): Promise<QueueHealthDto[]> {
    const queues = ['search', 'notifications', 'lifecycle'];
    const health: QueueHealthDto[] = [];

    for (const name of queues) {
      try {
        const [waiting, active, failed, delayed] = await Promise.all([
          this.redis.client.llen(`bull:${name}:wait`),
          this.redis.client.llen(`bull:${name}:active`),
          this.redis.client.zcard(`bull:${name}:failed`),
          this.redis.client.zcard(`bull:${name}:delayed`),
        ]);
        health.push({ name, waiting, active, failed, delayed, available: true });
      } catch {
        health.push({ name, waiting: 0, active: 0, failed: 0, delayed: 0, available: false });
      }
    }

    return health;
  }

  /**
   * Runs a maintenance job now instead of waiting for its schedule.
   *
   * Every one of these already runs on a cron, so this adds no capability the platform
   * did not have — it removes a wait. After an incident, "the expiry sweep runs at
   * quarter past" is not an answer, and the alternative is someone opening a Redis client
   * against production.
   *
   * The jobs are all idempotent by design: each re-reads current state rather than
   * carrying it in the payload, so running one early is safe and running it twice is a
   * no-op.
   */
  async runJob(name: string, requestedBy: string): Promise<{ queued: true; job: string }> {
    if (!RUNNABLE_JOBS.includes(name)) {
      throw new BadRequestException(
        `Unknown job "${name}". Runnable jobs: ${RUNNABLE_JOBS.join(', ')}`,
      );
    }

    // A fixed job id per name means an impatient double-click is a no-op rather than two
    // concurrent sweeps. Hyphen, not colon: BullMQ rejects a custom id containing ':'.
    await this.lifecycle.add(
      name,
      { requestedBy },
      { jobId: `manual-${name}-${Date.now()}`, removeOnComplete: true },
    );

    this.logger.log(`${name} queued manually by ${requestedBy}`);
    return { queued: true, job: name };
  }

  /**
   * User directory for the console. Searchable by name, phone or email so a moderator
   * handling a report can find the account from whatever identifier they have.
   */
  async listUsers(
    page: number,
    limit: number,
    search?: string,
  ): Promise<{ items: AdminUserDto[]; total: number }> {
    const where = search
      ? {
          deletedAt: null,
          OR: [
            { displayName: { contains: search, mode: 'insensitive' as const } },
            { phoneE164: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : { deletedAt: null };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          roles: { include: { role: { select: { name: true } } } },
          _count: { select: { listings: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Reports filed against each user's listings — the signal that matters most when
    // deciding whether an account is a problem. Summed from the denormalised counter on
    // each listing rather than by scanning the reports table.
    const reportsByOwner = new Map<string, number>();
    const grouped = await this.prisma.listing.findMany({
      where: { ownerId: { in: users.map((user) => user.id) } },
      select: { ownerId: true, reportCount: true },
    });
    for (const listing of grouped) {
      reportsByOwner.set(
        listing.ownerId,
        (reportsByOwner.get(listing.ownerId) ?? 0) + listing.reportCount,
      );
    }

    const items: AdminUserDto[] = users.map((user) => ({
      id: user.id,
      phone: user.phoneE164,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      roles: user.roles.map((assignment) => assignment.role.name),
      listingCount: user._count.listings,
      reportsAgainst: reportsByOwner.get(user.id) ?? 0,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
    }));

    return { items, total };
  }

  /**
   * Audit trail. Filterable by entity so a moderator can reconstruct everything that
   * happened to one listing or one account, which is the question actually asked during
   * a dispute or an appeal.
   */
  async listAuditLogs(
    page: number,
    limit: number,
    filters: { entityType?: string; entityId?: string; actorId?: string; action?: string } = {},
  ): Promise<{ items: AuditLogDto[]; total: number }> {
    const where = {
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.action ? { action: { contains: filters.action } } : {}),
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items: AuditLogDto[] = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      actorName: log.actor?.displayName ?? null,
      actorRole: log.actorRole,
      changes: (log.changes as Record<string, unknown> | null) ?? null,
      ip: log.ip,
      correlationId: log.correlationId,
      createdAt: log.createdAt,
    }));

    return { items, total };
  }

  async getStorageStats(): Promise<{
    mediaCount: number;
    totalBytes: number;
    failedCount: number;
  }> {
    const [aggregate, failedCount] = await Promise.all([
      this.prisma.listingMedia.aggregate({
        where: { status: 'READY' },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      this.prisma.listingMedia.count({ where: { status: 'FAILED' } }),
    ]);

    return {
      mediaCount: aggregate._count._all,
      totalBytes: aggregate._sum.sizeBytes ?? 0,
      failedCount,
    };
  }
}
