import { ListingStatus, ModerationStatus } from '@prisma/client';
import { ImageModerationService } from '../src/media/image-moderation.service';
import { ImageFingerprint } from '../src/media/image-fingerprint';

/**
 * The decisions around an uploaded image.
 *
 * The fingerprinting itself is covered next door. What matters here is what is done with
 * it: whether a picture a moderator already refused is recognised when it comes back
 * wearing a different compression, and whether a listing that was published before anyone
 * could see its photographs is brought back for review.
 */
describe('ImageModerationService', () => {
  const fingerprint: ImageFingerprint = {
    sha256: 'a'.repeat(64),
    perceptual: 'f0f0f0f0f0f0f0f0',
    distinctive: true,
  };

  function build({
    exactBlock = null,
    perceptualBlocks = [],
    listing = null,
    mediaElsewhere = null,
    publishedByOwner = 10,
    media = null,
  }: {
    exactBlock?: { reason: string; category: string | null } | null;
    perceptualBlocks?: Array<{ hash: string; reason: string; category: string | null }>;
    listing?: { id: string; ownerId: string; status: ListingStatus } | null;
    mediaElsewhere?: { listingId: string } | null;
    publishedByOwner?: number;
    media?: { sha256: string | null; perceptualHash: string | null } | null;
  } = {}) {
    const prisma = {
      blockedImageHash: {
        findUnique: jest.fn().mockResolvedValue(exactBlock),
        findMany: jest.fn().mockResolvedValue(perceptualBlocks),
        upsert: jest.fn().mockResolvedValue({}),
      },
      listing: {
        findUnique: jest.fn().mockResolvedValue(listing),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(publishedByOwner),
      },
      listingMedia: {
        findFirst: jest.fn().mockResolvedValue(mediaElsewhere),
        findUnique: jest.fn().mockResolvedValue(media),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue({}) };

    return {
      service: new ImageModerationService(prisma as never, queue as never),
      prisma,
      queue,
    };
  }

  // ------------------------------------------------------------------ recognising
  describe('recognising an image a moderator already refused', () => {
    it('matches the identical file', async () => {
      const { service } = build({
        exactBlock: { reason: 'Ivory carving listed as an antique bangle', category: 'WILDLIFE' },
      });

      await expect(service.findBlock(fingerprint)).resolves.toMatchObject({
        category: 'WILDLIFE',
      });
    });

    it('matches the same picture through another compressor', async () => {
      // One hex character different, which is at most four bits — well inside the
      // threshold, and exactly what a re-save produces.
      const { service } = build({
        perceptualBlocks: [
          { hash: 'f0f0f0f0f0f0f0f1', reason: 'Previously removed', category: 'WILDLIFE' },
        ],
      });

      await expect(service.findBlock(fingerprint)).resolves.not.toBeNull();
    });

    it('does not match a different photograph that happens to be on the list', async () => {
      const { service } = build({
        perceptualBlocks: [
          { hash: '0f0f0f0f0f0f0f0f', reason: 'Something else entirely', category: 'WILDLIFE' },
        ],
      });

      // Every bit differs. A list that matched this would refuse honest uploads, and a
      // seller cannot appeal what they cannot see.
      await expect(service.findBlock(fingerprint)).resolves.toBeNull();
    });

    it('will not match a blank image against the perceptual list', async () => {
      // Every blank picture hashes to the same sixty-four zero bits. Matching on that
      // would refuse every plain background once one placeholder had been blocked.
      const { service, prisma } = build({
        perceptualBlocks: [
          { hash: '0000000000000000', reason: 'A blocked placeholder', category: null },
        ],
      });

      await expect(
        service.findBlock({
          sha256: 'b'.repeat(64),
          perceptual: '0000000000000000',
          distinctive: false,
        }),
      ).resolves.toBeNull();
      expect(prisma.blockedImageHash.findMany).not.toHaveBeenCalled();
    });

    it('says nothing is blocked when nothing is', async () => {
      const { service } = build();

      await expect(service.findBlock(fingerprint)).resolves.toBeNull();
    });

    it('checks the exact hash before reading the whole perceptual list', async () => {
      const { service, prisma } = build({
        exactBlock: { reason: 'Previously removed', category: null },
      });

      await service.findBlock(fingerprint);

      expect(prisma.blockedImageHash.findMany).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------ pulling back
  describe('bringing a listing back for review', () => {
    const published = { id: 'listing-1', ownerId: 'owner-1', status: ListingStatus.PUBLISHED };

    it('pulls back a published listing when the picture belongs to someone else', async () => {
      const { service, prisma, queue } = build({
        listing: published,
        mediaElsewhere: { listingId: 'listing-9' },
      });

      await service.reviewOnUpload({ id: 'media-1', listingId: 'listing-1' } as never, fingerprint);

      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
        data: {
          status: ListingStatus.PENDING_REVIEW,
          moderationStatus: ModerationStatus.PENDING,
        },
      });
      // Off the shelf is not enough; it has to stop being findable too.
      expect(queue.add).toHaveBeenCalled();
    });

    it('queues a new seller even when the picture itself is unobjectionable', async () => {
      const { service, prisma, queue } = build({ listing: published, publishedByOwner: 0 });

      const result = await service.reviewOnUpload(
        { id: 'media-1', listingId: 'listing-1' } as never,
        fingerprint,
      );

      // A clean classifier score is silent on stolen goods, a forged certificate, someone
      // else's shopfront, or a child in the frame. Account age is the signal that covers
      // what the scanner cannot see, which is why a clean picture is not enough on its own.
      expect(result.decision).toBe('REVIEW');
      expect(result.reasons).toContain('IMAGE_FROM_NEW_ACCOUNT');
      expect(prisma.listing.update).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();
    });

    it('still pulls back a new seller when the picture belongs to someone else', async () => {
      const { service, prisma } = build({
        listing: published,
        publishedByOwner: 0,
        mediaElsewhere: { listingId: 'listing-9' },
      });

      const result = await service.reviewOnUpload(
        { id: 'media-1', listingId: 'listing-1' } as never,
        fingerprint,
      );

      expect(result.decision).toBe('REVIEW');
      expect(result.reasons).toContain('IMAGE_USED_BY_ANOTHER_ACCOUNT');
      expect(prisma.listing.update).toHaveBeenCalled();
    });

    it('leaves an established seller alone', async () => {
      const { service, prisma, queue } = build({ listing: published, publishedByOwner: 40 });

      await service.reviewOnUpload({ id: 'media-1', listingId: 'listing-1' } as never, fingerprint);

      expect(prisma.listing.update).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('publishes an established seller when the scanner could not be reached', async () => {
      const { service, prisma, queue } = build({ listing: published, publishedByOwner: 40 });

      await expect(
        service.reviewOnUpload({ id: 'media-1', listingId: 'listing-1' } as never, fingerprint, {
          unavailable: ['IMAGE_SCANNER_UNAVAILABLE'],
        }),
      ).resolves.toEqual({
        decision: 'APPROVE',
        reasons: ['IMAGE_SCANNER_UNAVAILABLE'],
      });

      // The reason is still recorded and still logged at error level; what it no longer
      // does is take an established seller's listing off the shelf because a dependency
      // was down.
      expect(prisma.listing.update).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('still queues a new seller when the scanner could not be reached', async () => {
      const { service, prisma } = build({ listing: published, publishedByOwner: 0 });

      const result = await service.reviewOnUpload(
        { id: 'media-1', listingId: 'listing-1' } as never,
        fingerprint,
        { unavailable: ['IMAGE_SCANNER_UNAVAILABLE'] },
      );

      // Failing open is for low-risk uploads. Everything else queues — which is the whole
      // difference between failing open and simply switching the control off.
      expect(result.decision).toBe('REVIEW');
      expect(prisma.listing.update).toHaveBeenCalled();
    });

    it('queues a flagged picture rather than rejecting it', async () => {
      const { service, prisma } = build({ listing: published, publishedByOwner: 40 });

      const result = await service.reviewOnUpload(
        { id: 'media-1', listingId: 'listing-1' } as never,
        fingerprint,
        { flagged: ['NSFWJS_EXPLICIT'] },
      );

      // There is no reject path from an image alone. A probability about pixels is not
      // enough to delete an honest seller's photograph with an accusation attached.
      expect(result.decision).toBe('REVIEW');
      expect(result.reasons).toContain('NSFWJS_EXPLICIT');
      expect(prisma.listing.update).toHaveBeenCalled();
    });

    it('does not resurrect a listing that was already refused', async () => {
      const { service, prisma } = build({
        listing: { ...published, status: ListingStatus.REMOVED },
        publishedByOwner: 0,
      });

      await service.reviewOnUpload({ id: 'media-1', listingId: 'listing-1' } as never, fingerprint);

      // A removed listing must not be quietly moved into a queue where a moderator might
      // approve it back into existence.
      expect(prisma.listing.update).not.toHaveBeenCalled();
    });

    it('does nothing for a listing that no longer exists', async () => {
      const { service, prisma } = build({ listing: null });

      await service.reviewOnUpload({ id: 'media-1', listingId: 'gone' } as never, fingerprint);

      expect(prisma.listing.update).not.toHaveBeenCalled();
    });

    it('survives the queue being unavailable', async () => {
      const { service, prisma } = build({
        listing: published,
        publishedByOwner: 0,
        mediaElsewhere: { listingId: 'listing-9' },
      });
      // Redis being down must not leave the listing published because the write that
      // followed the enqueue never ran.
      const failing = { add: jest.fn().mockRejectedValue(new Error('Redis is down')) };
      const resilient = new ImageModerationService(prisma as never, failing as never);

      await expect(
        resilient.reviewOnUpload({ id: 'media-1', listingId: 'listing-1' } as never, fingerprint),
      ).resolves.toEqual({
        decision: 'REVIEW',
        reasons: ['IMAGE_USED_BY_ANOTHER_ACCOUNT', 'IMAGE_FROM_NEW_ACCOUNT'],
      });

      expect(prisma.listing.update).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------ blocking
  describe('blocking an image', () => {
    it('records both hashes, so a re-crop is refused as well as the same file', async () => {
      const { service, prisma } = build({
        media: { sha256: fingerprint.sha256, perceptualHash: fingerprint.perceptual },
      });

      const result = await service.blockImage(
        'media-1',
        'moderator-1',
        'Ivory carving',
        'WILDLIFE',
      );

      expect(result).toEqual({ blocked: 2 });
      const kinds = prisma.blockedImageHash.upsert.mock.calls.map(
        (call) => call[0].create.kind as string,
      );
      expect(kinds.sort()).toEqual(['PERCEPTUAL', 'SHA256']);
    });

    it('records who blocked it and why', async () => {
      const { service, prisma } = build({
        media: { sha256: fingerprint.sha256, perceptualHash: fingerprint.perceptual },
      });

      await service.blockImage('media-1', 'moderator-7', 'Ivory carving', 'WILDLIFE');

      expect(prisma.blockedImageHash.upsert.mock.calls[0][0].create).toMatchObject({
        blockedById: 'moderator-7',
        reason: 'Ivory carving',
        category: 'WILDLIFE',
      });
    });

    it('does nothing for an image that never finished processing', async () => {
      const { service, prisma } = build({ media: { sha256: null, perceptualHash: null } });

      await expect(service.blockImage('media-1', 'moderator-1', 'Ivory')).resolves.toEqual({
        blocked: 0,
      });
      expect(prisma.blockedImageHash.upsert).not.toHaveBeenCalled();
    });

    it('does nothing for an image that does not exist', async () => {
      const { service } = build({ media: null });

      await expect(service.blockImage('gone', 'moderator-1', 'Ivory')).resolves.toEqual({
        blocked: 0,
      });
    });
  });
});
