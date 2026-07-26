import {
  ListingStatus,
  MediaSafetyAccessAction,
  MediaSafetyCaseStatus,
  MediaStatus,
} from '@prisma/client';
import { MediaSafetyService } from '../src/media/media-safety.service';

describe('MediaSafetyService', () => {
  function build() {
    const held = {
      id: 'media-1',
      listingId: 'listing-1',
      status: MediaStatus.LEGAL_HOLD,
      storageKey: 'quarantine/listings/listing-1/originals/media-1.jpeg',
    };
    const prisma: any = {
      listing: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'listing-1',
          status: ListingStatus.PUBLISHED,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      listingMedia: {
        update: jest.fn().mockResolvedValue(held),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mediaSafetyCase: {
        upsert: jest.fn().mockResolvedValue({ id: 'case-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'case-1',
          mediaId: 'media-1',
          status: MediaSafetyCaseStatus.OPEN,
          media: { status: MediaStatus.LEGAL_HOLD },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'case-1',
          status: MediaSafetyCaseStatus.OPEN,
          media: held,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      mediaSafetyAccessLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction = jest.fn(
      (operation: Promise<unknown>[] | ((tx: typeof prisma) => Promise<unknown>)) =>
        typeof operation === 'function' ? operation(prisma) : Promise.all(operation),
    );
    const storage = {
      createDownloadUrlWithExpiry: jest
        .fn()
        .mockResolvedValue({ url: 'https://private.invalid/signed', expiresInSeconds: 300 }),
    };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const service = new MediaSafetyService(prisma as never, storage as never, queue as never);
    return { service, prisma, storage, queue, held };
  }

  it('atomically holds the media, opens a case, and escalates the listing', async () => {
    const { service, prisma, queue } = build();

    await service.placeLegalHold({ id: 'media-1', listingId: 'listing-1' } as never, {
      status: 'MATCH',
      provider: 'approved-test-provider',
      reasonCode: 'KNOWN_PROTECTED_HASH_MATCH',
      reference: 'opaque-provider-case',
    });

    expect(prisma.listingMedia.update).toHaveBeenCalledWith({
      where: { id: 'media-1' },
      data: expect.objectContaining({ status: MediaStatus.LEGAL_HOLD }),
    });
    expect(prisma.mediaSafetyCase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          status: expect.anything(),
          reportedAt: expect.anything(),
          releasedAt: expect.anything(),
          closedAt: expect.anything(),
        }),
        create: expect.objectContaining({
          providerReference: 'opaque-provider-case',
          reasonCode: 'KNOWN_PROTECTED_HASH_MATCH',
        }),
      }),
    );
    expect(prisma.listing.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: expect.objectContaining({ status: ListingStatus.PENDING_REVIEW }),
    });
    expect(queue.add).toHaveBeenCalled();
  });

  it('records specialist access before issuing the signed evidence URL', async () => {
    const { service, prisma, storage } = build();

    await service.evidencePreview(
      'case-1',
      '00000000-0000-4000-8000-000000000001',
      'Verify provider match before statutory report',
    );

    expect(prisma.mediaSafetyAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: MediaSafetyAccessAction.EVIDENCE_PREVIEW,
        justification: 'Verify provider match before statutory report',
      }),
    });
    expect(prisma.mediaSafetyAccessLog.create.mock.invocationCallOrder[0]!).toBeLessThan(
      storage.createDownloadUrlWithExpiry.mock.invocationCallOrder[0]!,
    );
  });

  it('never issues evidence when the media is no longer held', async () => {
    const { service, prisma, storage } = build();
    prisma.mediaSafetyCase.findFirst.mockResolvedValue({
      id: 'case-1',
      status: MediaSafetyCaseStatus.OPEN,
      media: { status: MediaStatus.REVIEW_REQUIRED },
    });

    await expect(
      service.evidencePreview(
        'case-1',
        '00000000-0000-4000-8000-000000000001',
        'Verify provider match before statutory report',
      ),
    ).rejects.toThrow('not on legal hold');
    expect(storage.createDownloadUrlWithExpiry).not.toHaveBeenCalled();
  });

  it('returns metadata and prior history without exposing evidence location', async () => {
    const { service, prisma } = build();
    const openedAt = new Date('2026-07-26T08:00:00.000Z');
    const viewedAt = new Date('2026-07-26T08:05:00.000Z');
    prisma.mediaSafetyCase.findUnique.mockResolvedValue({
      id: 'case-1',
      mediaId: 'media-1',
      status: MediaSafetyCaseStatus.OPEN,
      provider: 'approved-test-provider',
      providerReference: 'opaque-provider-case',
      reasonCode: 'KNOWN_PROTECTED_HASH_MATCH',
      reportReference: null,
      resolutionNote: null,
      openedAt,
      reportedAt: null,
      releasedAt: null,
      closedAt: null,
      media: {
        listingId: 'listing-1',
        status: MediaStatus.LEGAL_HOLD,
        storageKey: 'must-never-be-selected',
      },
      accessLogs: [
        {
          id: 'access-1',
          actorId: 'officer-1',
          action: MediaSafetyAccessAction.CASE_VIEWED,
          justification: 'Restricted case metadata viewed',
          createdAt: viewedAt,
        },
      ],
    });

    const detail = await service.getCaseDetail('case-1', 'officer-2');

    expect(detail).toEqual({
      id: 'case-1',
      mediaId: 'media-1',
      listingId: 'listing-1',
      status: MediaSafetyCaseStatus.OPEN,
      mediaStatus: MediaStatus.LEGAL_HOLD,
      provider: 'approved-test-provider',
      providerReference: 'opaque-provider-case',
      reasonCode: 'KNOWN_PROTECTED_HASH_MATCH',
      reportReference: null,
      resolutionNote: null,
      openedAt,
      reportedAt: null,
      releasedAt: null,
      closedAt: null,
      accessHistory: [
        {
          id: 'access-1',
          actorId: 'officer-1',
          action: MediaSafetyAccessAction.CASE_VIEWED,
          justification: 'Restricted case metadata viewed',
          createdAt: viewedAt,
        },
      ],
    });
    expect(detail).not.toHaveProperty('storageKey');
    expect(JSON.stringify(detail)).not.toContain('must-never-be-selected');
    expect(prisma.mediaSafetyCase.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          media: { select: { listingId: true, status: true } },
          accessLogs: expect.objectContaining({
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
        }),
      }),
    );
    expect(prisma.mediaSafetyAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case-1',
        actorId: 'officer-2',
        action: MediaSafetyAccessAction.CASE_VIEWED,
      }),
    });
  });

  it('does not write a view event for a case that does not exist', async () => {
    const { service, prisma } = build();
    prisma.mediaSafetyCase.findUnique.mockResolvedValue(null);

    await expect(service.getCaseDetail('missing-case', 'officer-2')).rejects.toThrow(
      'Safety case not found',
    );
    expect(prisma.mediaSafetyAccessLog.create).not.toHaveBeenCalled();
  });

  it('moves an open held case to reported and audits the named action', async () => {
    const { service, prisma } = build();

    await expect(
      service.markReported(
        'case-1',
        '00000000-0000-4000-8000-000000000001',
        ' REPORT-2026-004 ',
        ' Submitted through the approved reporting channel ',
      ),
    ).resolves.toEqual({ id: 'case-1', status: MediaSafetyCaseStatus.REPORTED });

    expect(prisma.mediaSafetyCase.updateMany).toHaveBeenCalledWith({
      where: { id: 'case-1', status: MediaSafetyCaseStatus.OPEN },
      data: expect.objectContaining({
        status: MediaSafetyCaseStatus.REPORTED,
        reportReference: 'REPORT-2026-004',
        reportedAt: expect.any(Date),
      }),
    });
    expect(prisma.mediaSafetyAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: MediaSafetyAccessAction.CASE_REPORTED,
        justification: 'Submitted through the approved reporting channel',
      }),
    });
  });

  it('releases an active hold only back to ordinary human review', async () => {
    const { service, prisma } = build();
    prisma.mediaSafetyCase.findUnique.mockResolvedValue({
      id: 'case-1',
      mediaId: 'media-1',
      status: MediaSafetyCaseStatus.REPORTED,
      media: { status: MediaStatus.LEGAL_HOLD },
    });

    await expect(
      service.releaseHold(
        'case-1',
        '00000000-0000-4000-8000-000000000001',
        'Confirmed false positive by the approved specialist',
      ),
    ).resolves.toEqual({ id: 'case-1', status: MediaSafetyCaseStatus.RELEASED });

    expect(prisma.listingMedia.updateMany).toHaveBeenCalledWith({
      where: { id: 'media-1', status: MediaStatus.LEGAL_HOLD },
      data: {
        status: MediaStatus.REVIEW_REQUIRED,
        failureReason: 'This image is awaiting a moderator review.',
      },
    });
    expect(prisma.mediaSafetyAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: MediaSafetyAccessAction.HOLD_RELEASED }),
    });
  });

  it('closes only a reported case and leaves the evidence on legal hold', async () => {
    const { service, prisma } = build();
    prisma.mediaSafetyCase.findUnique.mockResolvedValue({
      id: 'case-1',
      mediaId: 'media-1',
      status: MediaSafetyCaseStatus.REPORTED,
      media: { status: MediaStatus.LEGAL_HOLD },
    });

    await expect(
      service.closeCase(
        'case-1',
        '00000000-0000-4000-8000-000000000001',
        'Reporting acknowledgement recorded and active handling completed',
      ),
    ).resolves.toEqual({ id: 'case-1', status: MediaSafetyCaseStatus.CLOSED });

    expect(prisma.listingMedia.updateMany).not.toHaveBeenCalled();
    expect(prisma.mediaSafetyAccessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: MediaSafetyAccessAction.CASE_CLOSED }),
    });
  });

  it('fails a raced transition without writing a misleading audit event', async () => {
    const { service, prisma } = build();
    prisma.mediaSafetyCase.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.markReported(
        'case-1',
        '00000000-0000-4000-8000-000000000001',
        'REPORT-2026-004',
        'Submitted through the approved reporting channel',
      ),
    ).rejects.toThrow('changed while it was being reported');

    expect(prisma.mediaSafetyAccessLog.create).not.toHaveBeenCalled();
  });
});
