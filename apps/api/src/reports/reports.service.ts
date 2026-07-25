import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ListingStatus,
  NotificationType,
  Prisma,
  ReportStatus,
  ReportTargetType,
} from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { PaginatedDto, paginate } from '../common/dto/pagination.dto';
import { TooManyRequestsException } from '../common/exceptions/too-many-requests.exception';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateReportDto, ReportDto, ReportQueryDto, ResolveReportDto } from './dto/report.dto';

/**
 * User reports.
 *
 * Reporting is the platform's most important safety signal, and also an easy weapon:
 * a competitor can bury a rival by mass-reporting. So a report never removes anything
 * on its own — it raises a counter, escalates at a threshold, and hands the decision to
 * a human.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  /** Open reports against one listing before it is pulled from public view for review. */
  private static readonly AUTO_ESCALATE_AT = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async create(userId: string, dto: CreateReportDto, ip?: string): Promise<string> {
    await this.assertReportRateLimit(userId);

    const target = await this.resolveTarget(dto.targetType, dto.targetId);
    if (target.ownerId === userId) {
      throw new BadRequestException('You cannot report your own content');
    }

    // A user may report a given listing once. The unique constraint makes a repeat
    // submission a no-op rather than a way to inflate the counter.
    if (dto.targetType === ReportTargetType.LISTING) {
      const existing = await this.prisma.report.findUnique({
        where: { reporterId_listingId: { reporterId: userId, listingId: dto.targetId } },
      });
      if (existing) return existing.id;
    }

    const report = await this.prisma.report.create({
      data: {
        id: uuid(),
        targetType: dto.targetType,
        listingId: dto.targetType === ReportTargetType.LISTING ? dto.targetId : null,
        businessId: dto.targetType === ReportTargetType.BUSINESS ? dto.targetId : null,
        reportedUserId: dto.targetType === ReportTargetType.USER ? dto.targetId : null,
        conversationId: dto.targetType === ReportTargetType.MESSAGE ? dto.targetId : null,
        reporterId: userId,
        reason: dto.reason,
        details: dto.details,
      },
    });

    if (dto.targetType === ReportTargetType.LISTING) {
      const listing = await this.prisma.listing.update({
        where: { id: dto.targetId },
        data: { reportCount: { increment: 1 } },
      });

      // Enough independent complaints to be worth interrupting: hide it and queue it,
      // but never auto-delete — the report might be the abuse.
      if (
        listing.reportCount >= ReportsService.AUTO_ESCALATE_AT &&
        listing.status === ListingStatus.PUBLISHED
      ) {
        await this.prisma.listing.update({
          where: { id: listing.id },
          data: { status: ListingStatus.PENDING_REVIEW, moderationStatus: 'ESCALATED' },
        });
        this.logger.warn(`Listing ${listing.id} escalated after ${listing.reportCount} reports`);
      }
    }

    await this.audit.record({
      action: 'report.create',
      entityType: dto.targetType,
      entityId: dto.targetId,
      actorId: userId,
      changes: { reason: dto.reason },
      ip,
    });

    return report.id;
  }

  async list(query: ReportQueryDto): Promise<PaginatedDto<ReportDto>> {
    const where: Prisma.ReportWhereInput = query.status
      ? { status: query.status }
      : { status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW] } };

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          reporter: { select: { displayName: true } },
          listing: { select: { title: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.report.count({ where }),
    ]);

    // Reports against the same target, so a moderator sees "one complaint" versus
    // "the eighth complaint" without opening each one.
    const targetIds = reports.map((report) => report.listingId ?? report.reportedUserId ?? '');
    const grouped = await this.prisma.report.groupBy({
      by: ['listingId'],
      where: {
        listingId: { in: targetIds.filter(Boolean) },
        status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW] },
      },
      _count: { _all: true },
    });
    const countByTarget = new Map(grouped.map((entry) => [entry.listingId, entry._count._all]));

    const items: ReportDto[] = reports.map((report) => ({
      id: report.id,
      targetType: report.targetType,
      targetId: report.listingId ?? report.businessId ?? report.reportedUserId ?? '',
      targetTitle: report.listing?.title ?? null,
      reason: report.reason,
      details: report.details,
      status: report.status,
      reporterName: report.reporter.displayName,
      reportsAgainstTarget: countByTarget.get(report.listingId) ?? 1,
      createdAt: report.createdAt,
      resolutionNote: report.resolutionNote,
    }));

    return paginate(items, total, query.page, query.limit);
  }

  /**
   * Resolves a report. Removing the listing is an explicit choice by the moderator, not
   * an automatic consequence of the report existing.
   */
  async resolve(reportId: string, moderatorId: string, dto: ResolveReportDto): Promise<void> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    if (dto.removeListing && report.listingId) {
      await this.moderation.removeListing(report.listingId, moderatorId, dto.note);
    }

    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        resolvedById: moderatorId,
        resolutionNote: dto.note,
        resolvedAt: new Date(),
      },
    });

    // Everyone who reported this target learns the outcome — otherwise reporting feels
    // like shouting into a void and people stop doing it.
    if (report.listingId) {
      const related = await this.prisma.report.findMany({
        where: {
          listingId: report.listingId,
          status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW] },
        },
        select: { id: true, reporterId: true },
      });

      await this.prisma.report.updateMany({
        where: { id: { in: related.map((entry) => entry.id) } },
        data: {
          status: dto.status,
          resolvedById: moderatorId,
          resolutionNote: dto.note,
          resolvedAt: new Date(),
        },
      });

      for (const reporterId of new Set(related.map((entry) => entry.reporterId))) {
        await this.notifications.create({
          userId: reporterId,
          type: NotificationType.REPORT_RESOLUTION,
          title: 'Thanks for your report',
          body:
            dto.status === ReportStatus.RESOLVED
              ? 'We reviewed the content you reported and took action.'
              : 'We reviewed the content you reported and found no breach of our rules.',
          data: { entityType: 'Report', entityId: reportId, route: '/notifications' },
        });
      }
    }

    await this.audit.record({
      action: `report.${dto.status.toLowerCase()}`,
      entityType: 'Report',
      entityId: reportId,
      actorId: moderatorId,
      actorRole: 'MODERATOR',
      changes: { note: dto.note, removedListing: Boolean(dto.removeListing) },
    });
  }

  private async resolveTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<{ ownerId: string | null }> {
    switch (targetType) {
      case ReportTargetType.LISTING: {
        const listing = await this.prisma.listing.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { ownerId: true },
        });
        if (!listing) throw new NotFoundException('Listing not found');
        return { ownerId: listing.ownerId };
      }
      case ReportTargetType.BUSINESS: {
        const business = await this.prisma.business.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { ownerId: true },
        });
        if (!business) throw new NotFoundException('Business not found');
        return { ownerId: business.ownerId };
      }
      case ReportTargetType.USER: {
        const user = await this.prisma.user.findFirst({
          where: { id: targetId, deletedAt: null },
          select: { id: true },
        });
        if (!user) throw new NotFoundException('User not found');
        return { ownerId: user.id };
      }
      case ReportTargetType.MESSAGE: {
        const conversation = await this.prisma.conversation.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
        if (!conversation) throw new NotFoundException('Conversation not found');
        return { ownerId: null };
      }
    }
  }

  /** Mass-reporting is itself an abuse pattern, so the reporter is rate limited too. */
  private async assertReportRateLimit(userId: string): Promise<void> {
    const count = await this.redis.incrementWithWindow(`report:${userId}`, 3600);
    if (count > 10) {
      throw new TooManyRequestsException('You have submitted a lot of reports. Try again later.');
    }
  }
}
