import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ListingMedia,
  ListingStatus,
  MediaSafetyAccessAction,
  MediaSafetyCaseStatus,
  MediaStatus,
  ModerationStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { v7 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_REMOVE_LISTING, QUEUE_SEARCH } from '../queue/queue.constants';
import { ProtectedHashResult } from './protected-hash-provider.interface';
import { StorageService } from './storage.service';

@Injectable()
export class MediaSafetyService {
  private readonly logger = new Logger(MediaSafetyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE_SEARCH) private readonly searchQueue: Queue,
  ) {}

  async placeLegalHold(media: ListingMedia, match: ProtectedHashResult): Promise<ListingMedia> {
    if (match.status !== 'MATCH') {
      throw new BadRequestException('A legal hold requires a protected-hash match');
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: media.listingId },
      select: { id: true, status: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const caseId = uuid();
    const [held, safetyCase] = await this.prisma.$transaction([
      this.prisma.listingMedia.update({
        where: { id: media.id },
        data: {
          status: MediaStatus.LEGAL_HOLD,
          failureReason: 'This image is unavailable under our safety policy.',
        },
      }),
      this.prisma.mediaSafetyCase.upsert({
        where: { mediaId: media.id },
        update: {
          provider: match.provider,
          providerReference: match.reference ?? null,
          reasonCode: match.reasonCode ?? 'PROTECTED_HASH_MATCH',
        },
        create: {
          id: caseId,
          mediaId: media.id,
          status: MediaSafetyCaseStatus.OPEN,
          provider: match.provider,
          providerReference: match.reference ?? null,
          reasonCode: match.reasonCode ?? 'PROTECTED_HASH_MATCH',
        },
      }),
      this.prisma.listing.update({
        where: { id: media.listingId },
        data: {
          status:
            listing.status === ListingStatus.PUBLISHED
              ? ListingStatus.PENDING_REVIEW
              : listing.status,
          moderationStatus: ModerationStatus.ESCALATED,
        },
      }),
    ]);

    await this.searchQueue
      .add(
        JOB_REMOVE_LISTING,
        { listingId: media.listingId },
        { jobId: `remove-${media.listingId}`, removeOnComplete: true },
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Could not remove held listing ${media.listingId} from search: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    // Deliberately excludes provider, reference and reason: normal application logs are
    // not the restricted case system.
    this.logger.warn(`Media ${media.id} entered restricted legal hold case ${safetyCase.id}`);
    return held;
  }

  async evidencePreview(
    caseId: string,
    actorId: string,
    justification: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const safetyCase = await this.prisma.mediaSafetyCase.findFirst({
      where: {
        id: caseId,
        status: { in: [MediaSafetyCaseStatus.OPEN, MediaSafetyCaseStatus.REPORTED] },
      },
      include: { media: true },
    });
    if (!safetyCase) throw new NotFoundException('Open safety case not found');
    if (safetyCase.media.status !== MediaStatus.LEGAL_HOLD) {
      throw new BadRequestException('Safety case evidence is not on legal hold');
    }

    // Log the attempted disclosure before signing the URL. A storage outage should not
    // erase the fact that someone asked to see restricted evidence.
    await this.prisma.mediaSafetyAccessLog.create({
      data: {
        id: uuid(),
        caseId,
        actorId,
        action: MediaSafetyAccessAction.EVIDENCE_PREVIEW,
        justification: justification.trim(),
      },
    });

    return this.storage.createDownloadUrlWithExpiry(safetyCase.media.storageKey);
  }

  async getCaseDetail(
    caseId: string,
    actorId: string,
  ): Promise<{
    id: string;
    mediaId: string;
    listingId: string;
    status: MediaSafetyCaseStatus;
    mediaStatus: MediaStatus;
    provider: string;
    providerReference: string | null;
    reasonCode: string;
    reportReference: string | null;
    resolutionNote: string | null;
    openedAt: Date;
    reportedAt: Date | null;
    releasedAt: Date | null;
    closedAt: Date | null;
    accessHistory: Array<{
      id: string;
      actorId: string;
      action: MediaSafetyAccessAction;
      justification: string;
      createdAt: Date;
    }>;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const safetyCase = await tx.mediaSafetyCase.findUnique({
        where: { id: caseId },
        select: {
          id: true,
          mediaId: true,
          status: true,
          provider: true,
          providerReference: true,
          reasonCode: true,
          reportReference: true,
          resolutionNote: true,
          openedAt: true,
          reportedAt: true,
          releasedAt: true,
          closedAt: true,
          media: { select: { listingId: true, status: true } },
          accessLogs: {
            select: {
              id: true,
              actorId: true,
              action: true,
              justification: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          },
        },
      });
      if (!safetyCase) throw new NotFoundException('Safety case not found');

      await tx.mediaSafetyAccessLog.create({
        data: {
          id: uuid(),
          caseId,
          actorId,
          action: MediaSafetyAccessAction.CASE_VIEWED,
          justification: 'Restricted case metadata viewed',
        },
      });

      const { media, accessLogs, ...metadata } = safetyCase;
      return {
        ...metadata,
        listingId: media.listingId,
        mediaStatus: media.status,
        accessHistory: accessLogs.reverse(),
      };
    });
  }

  async markReported(
    caseId: string,
    actorId: string,
    reportReference: string,
    justification: string,
  ): Promise<{ id: string; status: MediaSafetyCaseStatus }> {
    return this.prisma.$transaction(async (tx) => {
      const safetyCase = await tx.mediaSafetyCase.findUnique({
        where: { id: caseId },
        select: { id: true, status: true, media: { select: { status: true } } },
      });
      if (!safetyCase) throw new NotFoundException('Safety case not found');
      if (
        safetyCase.status !== MediaSafetyCaseStatus.OPEN ||
        safetyCase.media.status !== MediaStatus.LEGAL_HOLD
      ) {
        throw new ConflictException('Only an open case with held evidence can be reported');
      }

      const transitioned = await tx.mediaSafetyCase.updateMany({
        where: { id: caseId, status: MediaSafetyCaseStatus.OPEN },
        data: {
          status: MediaSafetyCaseStatus.REPORTED,
          reportReference: reportReference.trim(),
          reportedAt: new Date(),
        },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException('Safety case changed while it was being reported');
      }

      await tx.mediaSafetyAccessLog.create({
        data: {
          id: uuid(),
          caseId,
          actorId,
          action: MediaSafetyAccessAction.CASE_REPORTED,
          justification: justification.trim(),
        },
      });

      return { id: caseId, status: MediaSafetyCaseStatus.REPORTED };
    });
  }

  async releaseHold(
    caseId: string,
    actorId: string,
    justification: string,
  ): Promise<{ id: string; status: MediaSafetyCaseStatus }> {
    return this.prisma.$transaction(async (tx) => {
      const safetyCase = await tx.mediaSafetyCase.findUnique({
        where: { id: caseId },
        select: { id: true, mediaId: true, status: true, media: { select: { status: true } } },
      });
      if (!safetyCase) throw new NotFoundException('Safety case not found');
      if (
        (safetyCase.status !== MediaSafetyCaseStatus.OPEN &&
          safetyCase.status !== MediaSafetyCaseStatus.REPORTED) ||
        safetyCase.media.status !== MediaStatus.LEGAL_HOLD
      ) {
        throw new ConflictException('Only an active case with held evidence can be released');
      }

      const transitioned = await tx.mediaSafetyCase.updateMany({
        where: { id: caseId, status: safetyCase.status },
        data: {
          status: MediaSafetyCaseStatus.RELEASED,
          releasedAt: new Date(),
          resolutionNote: justification.trim(),
        },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException('Safety case changed while its hold was being released');
      }

      const released = await tx.listingMedia.updateMany({
        where: { id: safetyCase.mediaId, status: MediaStatus.LEGAL_HOLD },
        data: {
          status: MediaStatus.REVIEW_REQUIRED,
          failureReason: 'This image is awaiting a moderator review.',
        },
      });
      if (released.count !== 1) {
        throw new ConflictException('Held evidence changed while the case was being released');
      }

      await tx.mediaSafetyAccessLog.create({
        data: {
          id: uuid(),
          caseId,
          actorId,
          action: MediaSafetyAccessAction.HOLD_RELEASED,
          justification: justification.trim(),
        },
      });

      return { id: caseId, status: MediaSafetyCaseStatus.RELEASED };
    });
  }

  async closeCase(
    caseId: string,
    actorId: string,
    justification: string,
  ): Promise<{ id: string; status: MediaSafetyCaseStatus }> {
    return this.prisma.$transaction(async (tx) => {
      const safetyCase = await tx.mediaSafetyCase.findUnique({
        where: { id: caseId },
        select: { id: true, status: true, media: { select: { status: true } } },
      });
      if (!safetyCase) throw new NotFoundException('Safety case not found');
      if (
        safetyCase.status !== MediaSafetyCaseStatus.REPORTED ||
        safetyCase.media.status !== MediaStatus.LEGAL_HOLD
      ) {
        throw new ConflictException('Only a reported case with held evidence can be closed');
      }

      const transitioned = await tx.mediaSafetyCase.updateMany({
        where: { id: caseId, status: MediaSafetyCaseStatus.REPORTED },
        data: {
          status: MediaSafetyCaseStatus.CLOSED,
          closedAt: new Date(),
          resolutionNote: justification.trim(),
        },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException('Safety case changed while it was being closed');
      }

      await tx.mediaSafetyAccessLog.create({
        data: {
          id: uuid(),
          caseId,
          actorId,
          action: MediaSafetyAccessAction.CASE_CLOSED,
          justification: justification.trim(),
        },
      });

      return { id: caseId, status: MediaSafetyCaseStatus.CLOSED };
    });
  }

  async listOpenCases(): Promise<
    Array<{
      id: string;
      mediaId: string;
      listingId: string;
      status: MediaSafetyCaseStatus;
      reasonCode: string;
      openedAt: Date;
    }>
  > {
    const cases = await this.prisma.mediaSafetyCase.findMany({
      where: { status: { in: [MediaSafetyCaseStatus.OPEN, MediaSafetyCaseStatus.REPORTED] } },
      select: {
        id: true,
        mediaId: true,
        status: true,
        reasonCode: true,
        openedAt: true,
        media: { select: { listingId: true } },
      },
      orderBy: { openedAt: 'asc' },
      take: 100,
    });

    return cases.map(({ media, ...safetyCase }) => ({
      ...safetyCase,
      listingId: media.listingId,
    }));
  }
}
