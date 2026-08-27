import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ListingMedia, ListingStatus, MediaStatus } from '@prisma/client';
import { ImageModerationService } from '../src/media/image-moderation.service';
import { ImageScanService } from '../src/media/image-scan.service';
import { MediaService } from '../src/media/media.service';
import { NsfwjsImageScanProvider } from '../src/media/nsfwjs-image-scan.provider';

/**
 * The scanner, run for real.
 *
 * Every test below puts an actual image file through the actual nsfwjs model. There is no
 * stub classifier anywhere in this file, deliberately: mocking the scanner in the suite
 * that covers the scanner asserts only that the mock was configured, which is how a route
 * that returned 200 and five hundred green tests missed the fact that 100% of production
 * media was sitting behind a grey placeholder.
 *
 * The fixture is LocZ's own splash artwork, re-encoded as a JPEG. No explicit fixture is
 * committed, and none should be. The flagged path is exercised instead by lowering the
 * threshold beneath the fixture's genuine explicit score — real bytes, real inference, a
 * real number, and the branch under test is the one that runs in production.
 */
/**
 * Real model loading and real inference, so the 20-second default is not enough — the
 * first load is several seconds on its own and this suite runs after `tsc` in the
 * pre-push hook, where it competes for memory. A timeout here would report a scanner
 * fault that does not exist.
 */
jest.setTimeout(180_000);

describe('nsfwjs image scanning, end to end', () => {
  const listingId = '00000000-0000-4000-8000-000000000001';
  const mediaId = '00000000-0000-4000-8000-000000000002';
  const userId = '00000000-0000-4000-8000-000000000003';

  const cleanImage = readFileSync(join(__dirname, 'fixtures', 'clean-listing-image.jpg'));

  /** Below the fixture's real Porn+Hentai score of roughly 0.001, so it stays clean. */
  const NORMAL_EXPLICIT_THRESHOLD = 0.5;
  /** Above it, so the same real inference on the same real bytes now objects. */
  const FLAGGING_EXPLICIT_THRESHOLD = 0.0005;

  const DEFAULTS: Record<string, unknown> = {
    MEDIA_ALLOWED_MIME: ['image/jpeg', 'image/png', 'image/webp'],
    MEDIA_MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
    MEDIA_MAX_IMAGES_PER_LISTING: 12,
    IMAGE_SCANNER_PROVIDER: 'nsfwjs',
    IMAGE_SCANNER_TIMEOUT_MS: 30_000,
    IMAGE_SCANNER_MAX_ATTEMPTS: 2,
    NSFWJS_MODEL: 'MobileNetV2',
    NSFWJS_EXPLICIT_REVIEW_SCORE: NORMAL_EXPLICIT_THRESHOLD,
    NSFWJS_SUGGESTIVE_REVIEW_SCORE: 0.9,
  };

  /**
   * One mutable settings map and one provider for the whole file.
   *
   * Loading the model costs several seconds, and a fresh instance per test spent them
   * over and over. A single long-lived provider is also what the API actually runs.
   */
  let values: Record<string, unknown> = { ...DEFAULTS };
  const config = { get: jest.fn((key: string) => values[key]) };
  let provider: NsfwjsImageScanProvider;

  beforeAll(() => {
    provider = new NsfwjsImageScanProvider(config as never);
  });

  beforeEach(() => {
    values = { ...DEFAULTS };
    jest.restoreAllMocks();
  });

  // ------------------------------------------------------------------ the provider itself
  describe('NsfwjsImageScanProvider', () => {
    it('approves a real image, with the model loaded from disk and no network call', async () => {
      // If this ever needs the network, it fails here — which is the whole reason the
      // model is self-hosted rather than behind a vendor API.
      const fetchSpy = jest.spyOn(global, 'fetch');

      await expect(
        provider.scan({
          mediaId,
          mimeType: 'image/jpeg',
          bytes: cleanImage,
          sha256: 'a'.repeat(64),
        }),
      ).resolves.toEqual({ decision: 'APPROVE', reasons: [], provider: 'nsfwjs' });

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('reviews rather than rejects when the model does object', async () => {
      values.NSFWJS_EXPLICIT_REVIEW_SCORE = FLAGGING_EXPLICIT_THRESHOLD;

      const verdict = await provider.scan({
        mediaId,
        mimeType: 'image/jpeg',
        bytes: cleanImage,
        sha256: 'a'.repeat(64),
      });

      // The contract allows REJECT. This provider never uses it: a probability about
      // pixels is not enough to destroy an honest seller's photograph on its own.
      expect(verdict).toEqual({
        decision: 'REVIEW',
        reasons: ['NSFWJS_EXPLICIT'],
        provider: 'nsfwjs',
      });
    });

    it('throws on bytes it cannot decode, so retry and fail-closed review can run', async () => {
      await expect(
        provider.scan({
          mediaId,
          mimeType: 'image/jpeg',
          bytes: Buffer.from('this is not an image'),
          sha256: 'a'.repeat(64),
        }),
      ).rejects.toBeDefined();
    });
  });

  // ------------------------------------------------------------------ the whole pipeline
  describe('an upload, from bytes to published state', () => {
    function media(): ListingMedia {
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
        sizeBytes: cleanImage.byteLength,
        width: null,
        height: null,
        blurhash: null,
        sha256: null,
        perceptualHash: null,
        sortOrder: 0,
        isPrimary: true,
        failureReason: null,
        createdAt: new Date('2026-08-02T00:00:00Z'),
        updatedAt: new Date('2026-08-02T00:00:00Z'),
      };
    }

    /**
     * The real ImageScanService, the real NsfwjsImageScanProvider and the real
     * ImageModerationService. Only the database, object storage and the queue are stood
     * in for — none of them decides anything.
     */
    function build({
      publishedByOwner,
      scannerReachable = true,
      explicitThreshold = NORMAL_EXPLICIT_THRESHOLD,
    }: {
      publishedByOwner: number;
      scannerReachable?: boolean;
      explicitThreshold?: number;
    }) {
      const row = media();
      const prisma = {
        blockedImageHash: {
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
        listing: {
          findFirst: jest.fn().mockResolvedValue({ id: listingId, ownerId: userId }),
          findUnique: jest.fn().mockResolvedValue({
            id: listingId,
            ownerId: userId,
            status: ListingStatus.PUBLISHED,
          }),
          update: jest.fn().mockResolvedValue({}),
          count: jest.fn().mockResolvedValue(publishedByOwner),
        },
        listingMedia: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue(row),
          findFirst: jest.fn().mockResolvedValue(null),
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
        getObjectBytes: jest.fn().mockResolvedValue(cleanImage),
        putObject: jest.fn().mockResolvedValue(undefined),
        copy: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        createDownloadUrlWithExpiry: jest
          .fn()
          .mockResolvedValue({ url: 'https://private.invalid/signed', expiresInSeconds: 300 }),
        publicUrl: jest.fn((key: string) => `https://cdn.invalid/${key}`),
      };
      const queue = { add: jest.fn().mockResolvedValue({}) };
      values.NSFWJS_EXPLICIT_REVIEW_SCORE = explicitThreshold;

      // "Unreachable" is simulated at the vendor boundary, exactly as a dead endpoint
      // would surface: the provider throws, and everything above it is the real code.
      if (!scannerReachable) {
        // One attempt, so the outage case does not spend two long timeouts proving a point.
        values.IMAGE_SCANNER_MAX_ATTEMPTS = 1;
        jest
          .spyOn(provider, 'scan')
          .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8080'));
      }

      const moderation = new ImageModerationService(prisma as never, queue as never);
      const scanner = new ImageScanService(provider, config as never);
      const protectedHash = { match: jest.fn().mockResolvedValue({ status: 'NO_MATCH' }) };
      const mediaSafety = { placeLegalHold: jest.fn() };

      const service = new MediaService(
        prisma as never,
        storage as never,
        config as never,
        moderation,
        scanner,
        protectedHash as never,
        mediaSafety as never,
        { record: jest.fn() } as never,
      );

      return { service, storage, prisma, queue };
    }

    it('publishes an established seller’s clean image', async () => {
      const { service, storage } = build({ publishedByOwner: 40 });

      const result = await service.confirmUpload(mediaId, userId);

      expect(result.status).toBe(MediaStatus.READY);
      for (const [key] of storage.putObject.mock.calls) {
        expect(key).toMatch(/^public\/listings\//);
      }
    });

    it('queues a new account’s clean image instead of publishing it', async () => {
      const { service, storage } = build({ publishedByOwner: 0 });

      const result = await service.confirmUpload(mediaId, userId);

      // The model saw nothing wrong with these bytes, and that is precisely the point: it
      // cannot see stolen goods, a forged certificate, someone else's shopfront, or a
      // child in the frame. A first-time account gets a person.
      expect(result.status).toBe(MediaStatus.REVIEW_REQUIRED);
      for (const [key] of storage.putObject.mock.calls) {
        expect(key).toMatch(/^quarantine\/listings\//);
      }
    });

    it('queues a flagged image rather than rejecting the upload', async () => {
      const { service } = build({
        publishedByOwner: 40,
        explicitThreshold: FLAGGING_EXPLICIT_THRESHOLD,
      });

      const result = await service.confirmUpload(mediaId, userId);

      expect(result.status).toBe(MediaStatus.REVIEW_REQUIRED);
      expect(result.status).not.toBe(MediaStatus.REJECTED);
    });

    it('holds an established seller’s upload for review when the scanner is unreachable', async () => {
      const { service } = build({ publishedByOwner: 40, scannerReachable: false });

      const result = await service.confirmUpload(mediaId, userId);

      // Fail CLOSED: with the scanner down, even an established seller's image is held for review
      // rather than published unscanned — a child-safety control must not wave images through on an
      // outage. The upload is queued for a person, not refused, so a legitimate one still recovers.
      expect(result.status).toBe(MediaStatus.REVIEW_REQUIRED);
    });

    it('still queues a new account when the scanner is unreachable', async () => {
      const { service } = build({ publishedByOwner: 0, scannerReachable: false });

      const result = await service.confirmUpload(mediaId, userId);

      // Failing open is not the same as switching the control off. Low-risk publishes;
      // everything else waits for a person.
      expect(result.status).toBe(MediaStatus.REVIEW_REQUIRED);
    });
  });
});
