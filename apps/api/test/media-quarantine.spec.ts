import { ListingMedia, MediaStatus } from '@prisma/client';
import sharp from 'sharp';
import { MediaService } from '../src/media/media.service';

describe('MediaService quarantine boundary', () => {
  const listingId = '00000000-0000-4000-8000-000000000001';
  const mediaId = '00000000-0000-4000-8000-000000000002';
  const userId = '00000000-0000-4000-8000-000000000003';

  function media(overrides: Partial<ListingMedia> = {}): ListingMedia {
    return {
      id: mediaId,
      listingId,
      status: MediaStatus.PENDING_UPLOAD,
      storageKey: `quarantine/listings/${listingId}/originals/${mediaId}.jpeg`,
      thumbKey: null,
      cardKey: null,
      fullKey: null,
      avifKey: null,
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
      width: null,
      height: null,
      blurhash: null,
      sha256: null,
      perceptualHash: null,
      sortOrder: 0,
      isPrimary: true,
      failureReason: null,
      createdAt: new Date('2026-07-26T00:00:00Z'),
      updatedAt: new Date('2026-07-26T00:00:00Z'),
      ...overrides,
    };
  }

  function build(
    options: {
      row?: ListingMedia;
      block?: { reason: string; category: string | null } | null;
      decision?: 'APPROVE' | 'REVIEW';
      scannerDecision?: 'APPROVE' | 'REVIEW' | 'REJECT' | 'UNAVAILABLE';
      protectedHashStatus?: 'NO_MATCH' | 'MATCH' | 'UNAVAILABLE';
    } = {},
  ) {
    const row = options.row ?? media();
    const prisma = {
      listing: { findFirst: jest.fn().mockResolvedValue({ id: listingId, ownerId: userId }) },
      listingMedia: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(row),
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...row, listing: { id: listingId, ownerId: userId } }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Partial<ListingMedia> }) =>
            Promise.resolve({ ...row, ...data }),
          ),
      },
    };
    const storage = {
      createUploadUrl: jest
        .fn()
        .mockResolvedValue({ url: 'https://upload.invalid/signed', expiresInSeconds: 300 }),
      createDownloadUrlWithExpiry: jest
        .fn()
        .mockResolvedValue({ url: 'https://private.invalid/signed', expiresInSeconds: 300 }),
      getObjectBytes: jest.fn(),
      putObject: jest.fn().mockResolvedValue(undefined),
      copy: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      publicUrl: jest.fn((key: string) => `https://cdn.invalid/${key}`),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'MEDIA_ALLOWED_MIME') return ['image/jpeg', 'image/png', 'image/webp'];
        if (key === 'MEDIA_MAX_FILE_SIZE_BYTES') return 10 * 1024 * 1024;
        if (key === 'MEDIA_MAX_IMAGES_PER_LISTING') return 12;
        return undefined;
      }),
    };
    const moderation = {
      findBlock: jest.fn().mockResolvedValue(options.block ?? null),
      reviewOnUpload: jest.fn().mockResolvedValue({
        decision: options.decision ?? 'REVIEW',
        reasons: options.decision === 'APPROVE' ? [] : ['IMAGE_FROM_NEW_ACCOUNT'],
      }),
    };
    const scanner = {
      scan: jest.fn().mockResolvedValue({
        decision: options.scannerDecision ?? 'APPROVE',
        reasons:
          options.scannerDecision === 'REVIEW'
            ? ['NSFWJS_EXPLICIT']
            : options.scannerDecision === 'UNAVAILABLE'
              ? ['IMAGE_SCANNER_UNAVAILABLE']
              : [],
        provider: 'test',
      }),
    };
    const protectedHash = {
      match: jest.fn().mockResolvedValue({
        status: options.protectedHashStatus ?? 'NO_MATCH',
        provider: 'protected-test',
        reasonCode:
          options.protectedHashStatus === 'UNAVAILABLE'
            ? 'PROTECTED_HASH_PROVIDER_UNAVAILABLE'
            : options.protectedHashStatus === 'MATCH'
              ? 'KNOWN_PROTECTED_HASH_MATCH'
              : undefined,
        reference: options.protectedHashStatus === 'MATCH' ? 'opaque-case-reference' : undefined,
      }),
    };
    const mediaSafety = {
      placeLegalHold: jest.fn().mockImplementation((candidate: ListingMedia) =>
        Promise.resolve({
          ...candidate,
          status: MediaStatus.LEGAL_HOLD,
          failureReason: 'This image is unavailable under our safety policy.',
        }),
      ),
    };

    const service = new MediaService(
      prisma as never,
      storage as never,
      config as never,
      moderation as never,
      scanner as never,
      protectedHash as never,
      mediaSafety as never,
      // Audit is written on release; these cases do not exercise it.
      { record: jest.fn() } as never,
    );
    return {
      service,
      prisma,
      storage,
      moderation,
      scanner,
      protectedHash,
      mediaSafety,
      row,
    };
  }

  it('places every original under the private quarantine prefix', async () => {
    const { service, prisma, storage } = build();

    await service.createUploadUrl(listingId, userId, {
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
    });

    const created = prisma.listingMedia.create.mock.calls[0]![0].data;
    expect(created.storageKey).toMatch(new RegExp(`^quarantine/listings/${listingId}/originals/`));
    expect(storage.createUploadUrl).toHaveBeenCalledWith(created.storageKey, 'image/jpeg');
  });

  it('does not turn a quarantine key into a public URL', () => {
    const { service, storage } = build();
    const dto = service.toDto(
      media({
        status: MediaStatus.REVIEW_REQUIRED,
        thumbKey: `quarantine/listings/${listingId}/${mediaId}-thumb.webp`,
        cardKey: `quarantine/listings/${listingId}/${mediaId}-card.webp`,
        fullKey: `quarantine/listings/${listingId}/${mediaId}-full.webp`,
      }),
    );

    expect(dto).toMatchObject({ thumbUrl: null, cardUrl: null, fullUrl: null });
    expect(storage.publicUrl).not.toHaveBeenCalled();
  });

  it('only asks the database for media that is ready for public viewing', async () => {
    const { service, prisma } = build();
    prisma.listing.findFirst.mockResolvedValue({ ownerId: userId, status: 'PUBLISHED' });

    await service.listForListing(listingId);

    expect(prisma.listingMedia.findMany).toHaveBeenCalledWith({
      where: { listingId, status: MediaStatus.READY },
      orderBy: { sortOrder: 'asc' },
    });
  });

  it('shows nobody but the owner the images on a listing that is not published', async () => {
    const { service, prisma } = build();
    prisma.listing.findFirst.mockResolvedValue({ ownerId: userId, status: 'DRAFT' });

    // The listing itself is not public until it is published, and neither are its
    // photographs — this endpoint is `@Public()`, so without the check a draft's images were
    // readable by anybody who knew the listing id.
    await expect(service.listForListing(listingId)).resolves.toEqual([]);
    expect(prisma.listingMedia.findMany).not.toHaveBeenCalled();

    // The owner still sees them: the posting flow reads this to show what it has uploaded.
    await service.listForListing(listingId, userId);
    expect(prisma.listingMedia.findMany).toHaveBeenCalled();
  });

  it('keeps review-required renditions private until a moderator approves them', async () => {
    const original = await sharp({
      create: {
        width: 48,
        height: 32,
        channels: 3,
        background: { r: 20, g: 80, b: 140 },
      },
    })
      .jpeg()
      .toBuffer();
    const { service, storage, prisma } = build({ decision: 'REVIEW' });
    storage.getObjectBytes.mockResolvedValue(original);

    const result = await service.confirmUpload(mediaId, userId);

    expect(storage.putObject).toHaveBeenCalledTimes(3);
    for (const [key] of storage.putObject.mock.calls) {
      expect(key).toMatch(/^quarantine\/listings\//);
    }
    expect(prisma.listingMedia.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MediaStatus.REVIEW_REQUIRED }),
      }),
    );
    expect(result).toMatchObject({
      status: MediaStatus.REVIEW_REQUIRED,
      thumbUrl: null,
      cardUrl: null,
      fullUrl: null,
    });
  });

  it('keeps an otherwise approved image private when the scanner requires review', async () => {
    const original = await sharp({
      create: {
        width: 48,
        height: 32,
        channels: 3,
        background: { r: 20, g: 80, b: 140 },
      },
    })
      .jpeg()
      .toBuffer();
    const { service, storage, moderation } = build({
      decision: 'REVIEW',
      scannerDecision: 'REVIEW',
    });
    storage.getObjectBytes.mockResolvedValue(original);

    const result = await service.confirmUpload(mediaId, userId);

    expect(result.status).toBe(MediaStatus.REVIEW_REQUIRED);
    expect(moderation.reviewOnUpload).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ flagged: ['NSFWJS_EXPLICIT'] }),
    );
    expect(storage.putObject).toHaveBeenCalledTimes(3);
    for (const [key] of storage.putObject.mock.calls) {
      expect(key).toMatch(/^quarantine\/listings\//);
    }
  });

  it('promotes reviewed renditions before marking them ready', async () => {
    const pending = media({
      status: MediaStatus.REVIEW_REQUIRED,
      thumbKey: `quarantine/listings/${listingId}/${mediaId}-thumb.webp`,
      cardKey: `quarantine/listings/${listingId}/${mediaId}-card.webp`,
      fullKey: `quarantine/listings/${listingId}/${mediaId}-full.webp`,
    });
    const { service, prisma, storage } = build({ row: pending });
    prisma.listingMedia.findMany.mockResolvedValue([pending]);

    await expect(service.approveForListing(listingId)).resolves.toBe(1);

    expect(storage.copy).toHaveBeenCalledTimes(3);
    expect(storage.copy).toHaveBeenCalledWith(
      pending.fullKey,
      pending.fullKey!.replace('quarantine/', 'public/'),
    );
    expect(prisma.listingMedia.update).toHaveBeenCalledWith({
      where: { id: mediaId },
      data: expect.objectContaining({
        status: MediaStatus.READY,
        fullKey: pending.fullKey!.replace('quarantine/', 'public/'),
      }),
    });
  });

  it('rejects a known blocked image without disclosing the match reason', async () => {
    const original = await sharp({
      create: {
        width: 24,
        height: 24,
        channels: 3,
        background: { r: 80, g: 20, b: 20 },
      },
    })
      .jpeg()
      .toBuffer();
    const { service, storage, prisma } = build({
      block: { reason: 'private moderator note', category: 'ILLEGAL_CONTENT' },
    });
    storage.getObjectBytes.mockResolvedValue(original);

    const result = await service.confirmUpload(mediaId, userId);

    expect(result.status).toBe(MediaStatus.REJECTED);
    expect(result.failureReason).toBe(
      'This image cannot be used because it violates our content policy.',
    );
    expect(result.failureReason).not.toContain('private moderator note');
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(prisma.listingMedia.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MediaStatus.REJECTED }),
      }),
    );
  });

  it('never writes public renditions after a scanner rejection', async () => {
    const original = await sharp({
      create: {
        width: 24,
        height: 24,
        channels: 3,
        background: { r: 80, g: 20, b: 20 },
      },
    })
      .jpeg()
      .toBuffer();
    const { service, storage, moderation } = build({ scannerDecision: 'REJECT' });
    storage.getObjectBytes.mockResolvedValue(original);

    const result = await service.confirmUpload(mediaId, userId);

    expect(result.status).toBe(MediaStatus.REJECTED);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(moderation.reviewOnUpload).not.toHaveBeenCalled();
  });

  it('places a protected-hash match on legal hold without creating a rendition', async () => {
    const original = await sharp({
      create: {
        width: 24,
        height: 24,
        channels: 3,
        background: { r: 80, g: 20, b: 20 },
      },
    })
      .jpeg()
      .toBuffer();
    const { service, storage, scanner, mediaSafety } = build({
      protectedHashStatus: 'MATCH',
    });
    storage.getObjectBytes.mockResolvedValue(original);

    const result = await service.confirmUpload(mediaId, userId);

    expect(result.status).toBe(MediaStatus.LEGAL_HOLD);
    expect(mediaSafety.placeLegalHold).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        status: 'MATCH',
        reference: 'opaque-case-reference',
      }),
    );
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('refuses to promote any listing with held evidence', async () => {
    const { service, prisma, storage } = build();
    prisma.listingMedia.count.mockResolvedValue(1);

    await expect(service.approveForListing(listingId)).rejects.toThrow('restricted safety case');
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it('does not let the ordinary moderation preview open held evidence', async () => {
    const { service } = build({
      row: media({ status: MediaStatus.LEGAL_HOLD }),
    });

    await expect(service.moderationPreview(mediaId)).rejects.toThrow('not awaiting review');
  });
});
