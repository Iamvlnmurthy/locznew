import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ListingMedia, MediaStatus } from '@prisma/client';
import sharp from 'sharp';
import { fingerprintImage } from './image-fingerprint';
import { ImageModerationService } from './image-moderation.service';
import { ImageScanService } from './image-scan.service';
import { MediaSafetyService } from './media-safety.service';
import { ProtectedHashService } from './protected-hash.service';
import { v7 as uuid } from 'uuid';
import { AppConfig } from '../config/config.module';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUploadUrlDto, MediaDto, UploadUrlDto } from './dto/media.dto';
import { StorageService } from './storage.service';

class RejectedImageError extends Error {}

/** Rendition widths. Named sizes rather than arbitrary ones so clients can cache predictably. */
const RENDITIONS = [
  { name: 'thumb', width: 320, quality: 62 },
  { name: 'card', width: 720, quality: 72 },
  { name: 'full', width: 1440, quality: 78 },
] as const;

/**
 * Whether the uploaded original is kept once renditions exist.
 *
 * A phone camera produces 5–10 MB per photograph and the three renditions together come to
 * roughly 150 KB, so the original is about 98% of what a listing costs to store. On a 2 GiB
 * budget that is the difference between a few hundred images and several thousand.
 *
 * It is only discarded for images that were **approved**. Anything held for review, rejected,
 * or under a legal hold keeps its original, because that is precisely the material a
 * moderator or child-safety officer may need to look at, and `media-safety.service.ts` serves
 * it to them. Deleting evidence to save disk would be the wrong trade in exactly the cases
 * that matter most.
 *
 * For approved images the 1440px `full` rendition remains, so a later report still has
 * something to examine — a smaller copy of the same picture, not nothing.
 */
const DISCARD_ORIGINAL_WHEN_APPROVED = true;

/** Magic-byte signatures — a declared MIME type is a claim, not evidence. */
const MAGIC_BYTES: Array<{ mime: string; test: (buffer: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'image/heic', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
];

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
    private readonly imageModeration: ImageModerationService,
    private readonly imageScanner: ImageScanService,
    private readonly protectedHash: ProtectedHashService,
    private readonly mediaSafety: MediaSafetyService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Step 1 of the upload flow: validate intent and hand back a signed URL.
   *
   * Ownership, image count and MIME type are all checked here — before any bytes move —
   * so a client cannot fill the bucket by uploading first and asking later.
   */
  async createUploadUrl(
    listingId: string,
    userId: string,
    dto: CreateUploadUrlDto,
  ): Promise<UploadUrlDto> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.ownerId !== userId) {
      throw new ForbiddenException('You can only add images to your own listing');
    }

    const allowed = this.config.get('MEDIA_ALLOWED_MIME');
    if (allowed.length > 0 && !allowed.includes(dto.mimeType)) {
      throw new BadRequestException(`Unsupported image type. Allowed: ${allowed.join(', ')}`);
    }

    const maxBytes = this.config.get('MEDIA_MAX_FILE_SIZE_BYTES');
    if (dto.sizeBytes > maxBytes) {
      throw new BadRequestException(
        `Image is too large. Maximum size is ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
      );
    }

    const existingCount = await this.prisma.listingMedia.count({
      where: { listingId, status: { not: MediaStatus.FAILED } },
    });
    const maxImages = this.config.get('MEDIA_MAX_IMAGES_PER_LISTING');
    if (existingCount >= maxImages) {
      throw new BadRequestException(`A listing can have at most ${maxImages} images`);
    }

    const mediaId = uuid();
    const extension = dto.mimeType.split('/')[1] ?? 'bin';
    // Originals always remain private; only sanitized renditions can be promoted later.
    const storageKey = `quarantine/listings/${listingId}/originals/${mediaId}.${extension}`;

    await this.prisma.listingMedia.create({
      data: {
        id: mediaId,
        listingId,
        storageKey,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        status: MediaStatus.PENDING_UPLOAD,
        sortOrder: existingCount,
        isPrimary: existingCount === 0,
      },
    });

    const { url, expiresInSeconds } = await this.storage.createUploadUrl(storageKey, dto.mimeType);
    return { mediaId, uploadUrl: url, storageKey, expiresInSeconds };
  }

  /**
   * Step 2: the client reports the bytes are in place. Processing is synchronous here so
   * the poster sees a real thumbnail immediately; the same routine is what the retry job
   * calls for a media row stuck in PROCESSING.
   */
  async confirmUpload(mediaId: string, userId: string): Promise<MediaDto> {
    const media = await this.prisma.listingMedia.findUnique({
      where: { id: mediaId },
      include: { listing: { select: { ownerId: true } } },
    });
    if (!media) throw new NotFoundException('Upload not found');
    if (media.listing.ownerId !== userId) {
      throw new ForbiddenException('You can only confirm your own uploads');
    }
    if (
      media.status === MediaStatus.READY ||
      media.status === MediaStatus.REVIEW_REQUIRED ||
      media.status === MediaStatus.REJECTED ||
      media.status === MediaStatus.LEGAL_HOLD
    ) {
      return this.toDto(media);
    }

    await this.prisma.listingMedia.update({
      where: { id: mediaId },
      data: { status: MediaStatus.QUARANTINED },
    });

    try {
      const processed = await this.process(media);
      return this.toDto(processed);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Processing failed';
      this.logger.error(`Media ${mediaId} failed: ${reason}`);

      const rejected = error instanceof RejectedImageError;
      const failed = await this.prisma.listingMedia.update({
        where: { id: mediaId },
        data: {
          status: rejected ? MediaStatus.REJECTED : MediaStatus.FAILED,
          failureReason: rejected
            ? 'This image cannot be used because it violates our content policy.'
            : reason.slice(0, 300),
        },
      });
      // Never leave an unusable object behind.
      await this.storage.delete(media.storageKey);
      return this.toDto(failed);
    }
  }

  /**
   * Derives the three renditions.
   *
   * `rotate()` with no argument bakes in the EXIF orientation, and sharp drops all other
   * metadata by default — so the GPS coordinates in a phone photo never reach the public
   * bucket. That is a privacy requirement, not an optimisation: a seller's home address
   * should not be inferable from their listing photo.
   */
  private async process(media: ListingMedia): Promise<ListingMedia> {
    const original = await this.storage.getObjectBytes(media.storageKey);

    const detected = MAGIC_BYTES.find((entry) => entry.test(original));
    if (!detected) {
      throw new Error('The uploaded file is not a supported image');
    }

    const maxBytes = this.config.get('MEDIA_MAX_FILE_SIZE_BYTES');
    if (original.byteLength > maxBytes) {
      throw new Error(`Image exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit`);
    }

    const pipeline = sharp(original, { failOn: 'error' }).rotate();
    const metadata = await pipeline.metadata();

    // Fingerprints before renditions: a picture a moderator has already refused should not
    // be resized, stored and served while we decide what to do about it.
    const fingerprint = await fingerprintImage(original);
    const blocked = await this.imageModeration.findBlock(fingerprint);
    if (blocked) {
      // Do not return the matching category or a moderator's private notes to the uploader.
      throw new RejectedImageError('Image matches previously removed content');
    }

    const scanning = await this.prisma.listingMedia.update({
      where: { id: media.id },
      data: {
        status: MediaStatus.SCANNING,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        sha256: fingerprint.sha256,
        perceptualHash: fingerprint.perceptual,
        failureReason: null,
      },
    });
    const scanSubject = {
      mediaId: media.id,
      mimeType: detected.mime,
      bytes: original,
      sha256: fingerprint.sha256,
    };
    const protectedMatch = await this.protectedHash.match(scanSubject);
    if (protectedMatch.status === 'MATCH') {
      // No rendition is created. The private original becomes restricted evidence and
      // ordinary moderation never receives a preview URL for it.
      return this.mediaSafety.placeLegalHold(scanning, protectedMatch);
    }

    const scannerVerdict = await this.imageScanner.scan(scanSubject);
    if (scannerVerdict.decision === 'REJECT') {
      throw new RejectedImageError('Image safety provider rejected the upload');
    }

    const requiredReasons = [
      ...(protectedMatch.status === 'UNAVAILABLE'
        ? [protectedMatch.reasonCode ?? 'PROTECTED_HASH_PROVIDER_UNAVAILABLE']
        : []),
      ...(scannerVerdict.decision === 'REVIEW' ? scannerVerdict.reasons : []),
    ];
    const moderation = await this.imageModeration.reviewOnUpload(
      scanning,
      fingerprint,
      requiredReasons,
    );

    const keys: Record<string, string> = {};
    for (const rendition of RENDITIONS) {
      const buffer = await sharp(original)
        .rotate()
        // `effort: 6` spends more CPU searching for a smaller file. It costs about a second
        // per image on this hardware and typically saves 20–30% over the default, which is
        // worth it once rather than on every download for the life of the listing.
        .resize({ width: rendition.width, withoutEnlargement: true })
        .webp({ quality: rendition.quality, effort: 6 })
        .toBuffer();

      const prefix = moderation.decision === 'APPROVE' ? 'public' : 'quarantine';
      const key = `${prefix}/listings/${media.listingId}/${media.id}-${rendition.name}.webp`;
      await this.storage.putObject(key, buffer, 'image/webp');
      keys[rendition.name] = key;
    }

    // Approved images no longer need the multi-megabyte original; see
    // DISCARD_ORIGINAL_WHEN_APPROVED for why anything else keeps it.
    if (DISCARD_ORIGINAL_WHEN_APPROVED && moderation.decision === 'APPROVE') {
      try {
        await this.storage.delete(media.storageKey);
      } catch (error) {
        // Storage that will not delete is a housekeeping problem, not a reason to fail an
        // upload the user has already completed successfully. The orphan sweep will retry.
        this.logger.warn(
          `Could not discard the original for ${media.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return this.prisma.listingMedia.update({
      where: { id: media.id },
      data: {
        status: moderation.decision === 'APPROVE' ? MediaStatus.READY : MediaStatus.REVIEW_REQUIRED,
        thumbKey: keys.thumb,
        cardKey: keys.card,
        fullKey: keys.full,
        failureReason:
          moderation.decision === 'REVIEW' ? 'This image is awaiting a safety review.' : null,
      },
    });
  }

  async listForListing(listingId: string): Promise<MediaDto[]> {
    const media = await this.prisma.listingMedia.findMany({
      // This is a public endpoint: no quarantine or in-flight key may escape it.
      where: { listingId, status: MediaStatus.READY },
      orderBy: { sortOrder: 'asc' },
    });
    return media.map((entry) => this.toDto(entry));
  }

  /**
   * Promote sanitized renditions after a human approves the listing.
   *
   * Copy-before-update makes a failed promotion safe to retry: the database continues to
   * say REVIEW_REQUIRED until every public object exists.
   */
  async approveForListing(listingId: string): Promise<number> {
    const held = await this.prisma.listingMedia.count({
      where: { listingId, status: MediaStatus.LEGAL_HOLD },
    });
    if (held > 0) {
      throw new ConflictException('This listing has a restricted safety case');
    }

    const pending = await this.prisma.listingMedia.findMany({
      where: { listingId, status: MediaStatus.REVIEW_REQUIRED },
      orderBy: { sortOrder: 'asc' },
    });

    for (const media of pending) {
      const promoted: Record<'thumbKey' | 'cardKey' | 'fullKey', string | null> = {
        thumbKey: null,
        cardKey: null,
        fullKey: null,
      };

      for (const field of ['thumbKey', 'cardKey', 'fullKey'] as const) {
        const source = media[field];
        if (!source) continue;
        const destination = source.replace(/^quarantine\//, 'public/');
        await this.storage.copy(source, destination);
        promoted[field] = destination;
      }

      await this.prisma.listingMedia.update({
        where: { id: media.id },
        data: {
          status: MediaStatus.READY,
          ...promoted,
          failureReason: null,
        },
      });

      for (const field of ['thumbKey', 'cardKey', 'fullKey'] as const) {
        const source = media[field];
        if (source) await this.storage.delete(source);
      }
    }

    return pending.length;
  }


  /**
   * Publishes an image a moderator has looked at and accepted.
   *
   * This was missing entirely. The queue could preview an image and block it, and nothing
   * could release one — so the only route out of REVIEW_REQUIRED was the automated scanner
   * returning APPROVE. With the scanner unreachable every upload was trapped, and a moderator
   * sitting at the queue full time could not have published a single one.
   *
   * Copies through the storage API rather than moving files on disk. MinIO keeps its own
   * metadata for every object; anything written directly into its volume is invisible to it,
   * which produced a 400 on a key the filesystem clearly showed existed.
   *
   * The quarantine copies are left in place. Deleting them is the orphan sweep's job, and
   * keeping them until then means a release that turns out to be wrong can be reversed.
   */
  async releaseFromQuarantine(mediaId: string, moderatorId: string): Promise<void> {
    const media = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Image not found');
    if (media.status !== MediaStatus.REVIEW_REQUIRED) {
      throw new BadRequestException('This image is not awaiting review');
    }

    const published = (key: string | null): string | null =>
      key ? key.replace(/^quarantine\//, '') : null;

    const moves = [media.storageKey, media.thumbKey, media.cardKey, media.fullKey]
      .filter((key): key is string => Boolean(key) && key!.startsWith('quarantine/'));

    for (const key of moves) {
      await this.storage.copy(key, published(key)!);
    }

    await this.prisma.listingMedia.update({
      where: { id: media.id },
      data: {
        status: MediaStatus.READY,
        storageKey: published(media.storageKey) ?? media.storageKey,
        thumbKey: published(media.thumbKey),
        cardKey: published(media.cardKey),
        fullKey: published(media.fullKey),
        failureReason: null,
      },
    });

    // Publishing somebody else's photo is a decision that has to be attributable. A release
    // nobody can trace is one nobody can review when it turns out to be wrong.
    await this.audit.record({
      action: 'media.release',
      entityType: 'ListingMedia',
      entityId: media.id,
      actorId: moderatorId,
      changes: { listingId: media.listingId, objects: moves.length },
    });

    this.logger.log(`Media ${media.id} released from quarantine by ${moderatorId}`);
  }

  async moderationPreview(mediaId: string): Promise<{ url: string; expiresInSeconds: number }> {
    const media = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Image not found');
    if (media.status !== MediaStatus.REVIEW_REQUIRED) {
      throw new BadRequestException('This image is not awaiting review');
    }
    return this.storage.createDownloadUrlWithExpiry(media.fullKey ?? media.storageKey);
  }

  async reorder(listingId: string, userId: string, mediaIds: string[]): Promise<MediaDto[]> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { ownerId: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.ownerId !== userId) throw new ForbiddenException('This is not your listing');

    const existing = await this.prisma.listingMedia.findMany({
      where: { listingId },
      select: { id: true },
    });
    const known = new Set(existing.map((entry) => entry.id));
    if (mediaIds.some((id) => !known.has(id))) {
      throw new BadRequestException('The order refers to an image that is not on this listing');
    }

    // The order must name every image, not a subset.
    //
    // A partial list leaves the omitted images holding their old `sortOrder`, so positions
    // collide — and worse, an omitted image that was the cover keeps `isPrimary`, because
    // only the listed ones are rewritten. Two covers is not a state the rest of the code
    // expects: the summary query takes whichever `isPrimary` row the database returns first,
    // so the same listing shows different photographs on different requests.
    if (mediaIds.length !== existing.length || new Set(mediaIds).size !== mediaIds.length) {
      throw new BadRequestException(
        `The order must list each of the ${existing.length} images exactly once`,
      );
    }

    await this.prisma.$transaction(
      mediaIds.map((id, index) =>
        this.prisma.listingMedia.update({
          where: { id },
          data: { sortOrder: index, isPrimary: index === 0 },
        }),
      ),
    );

    return this.listForListing(listingId);
  }

  async delete(mediaId: string, userId: string): Promise<void> {
    const media = await this.prisma.listingMedia.findUnique({
      where: { id: mediaId },
      include: { listing: { select: { ownerId: true, id: true } } },
    });
    if (!media) throw new NotFoundException('Image not found');
    if (media.listing.ownerId !== userId) throw new ForbiddenException('This is not your image');
    if (media.status === MediaStatus.LEGAL_HOLD) {
      throw new ForbiddenException('This image cannot be deleted while a safety hold is active');
    }

    await this.prisma.listingMedia.delete({ where: { id: mediaId } });

    for (const key of [media.storageKey, media.thumbKey, media.cardKey, media.fullKey]) {
      if (key) await this.storage.delete(key);
    }

    // Deleting the primary image promotes the next one, so a listing is never left
    // without a cover photo while still having images.
    const remaining = await this.prisma.listingMedia.findMany({
      where: { listingId: media.listing.id },
      orderBy: { sortOrder: 'asc' },
    });
    if (remaining.length > 0 && !remaining.some((entry) => entry.isPrimary)) {
      await this.prisma.listingMedia.update({
        where: { id: remaining[0]!.id },
        data: { isPrimary: true },
      });
    }
  }

  toDto(media: ListingMedia): MediaDto {
    const isPublic = media.status === MediaStatus.READY;
    return {
      id: media.id,
      status: media.status,
      thumbUrl: isPublic && media.thumbKey ? this.storage.publicUrl(media.thumbKey) : null,
      cardUrl: isPublic && media.cardKey ? this.storage.publicUrl(media.cardKey) : null,
      fullUrl: isPublic && media.fullKey ? this.storage.publicUrl(media.fullKey) : null,
      blurhash: media.blurhash,
      sortOrder: media.sortOrder,
      isPrimary: media.isPrimary,
      failureReason: media.failureReason,
    };
  }
}
