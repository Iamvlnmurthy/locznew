import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ListingMedia, MediaStatus } from '@prisma/client';
import sharp from 'sharp';
import { v7 as uuid } from 'uuid';
import { AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUploadUrlDto, MediaDto, UploadUrlDto } from './dto/media.dto';
import { StorageService } from './storage.service';

/** Rendition widths. Named sizes rather than arbitrary ones so clients can cache predictably. */
const RENDITIONS = [
  { name: 'thumb', width: 320 },
  { name: 'card', width: 720 },
  { name: 'full', width: 1600 },
] as const;

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
    const storageKey = `listings/${listingId}/originals/${mediaId}.${extension}`;

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
    if (media.status === MediaStatus.READY) return this.toDto(media);

    await this.prisma.listingMedia.update({
      where: { id: mediaId },
      data: { status: MediaStatus.PROCESSING },
    });

    try {
      const processed = await this.process(media);
      return this.toDto(processed);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Processing failed';
      this.logger.error(`Media ${mediaId} failed: ${reason}`);

      const failed = await this.prisma.listingMedia.update({
        where: { id: mediaId },
        data: { status: MediaStatus.FAILED, failureReason: reason.slice(0, 300) },
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

    const keys: Record<string, string> = {};
    for (const rendition of RENDITIONS) {
      const buffer = await sharp(original)
        .rotate()
        .resize({ width: rendition.width, withoutEnlargement: true })
        .webp({ quality: rendition.name === 'thumb' ? 70 : 82 })
        .toBuffer();

      const key = `public/listings/${media.listingId}/${media.id}-${rendition.name}.webp`;
      await this.storage.putObject(key, buffer, 'image/webp');
      keys[rendition.name] = key;
    }

    return this.prisma.listingMedia.update({
      where: { id: media.id },
      data: {
        status: MediaStatus.READY,
        thumbKey: keys.thumb,
        cardKey: keys.card,
        fullKey: keys.full,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        failureReason: null,
      },
    });
  }

  async listForListing(listingId: string): Promise<MediaDto[]> {
    const media = await this.prisma.listingMedia.findMany({
      where: { listingId, status: { in: [MediaStatus.READY, MediaStatus.PROCESSING] } },
      orderBy: { sortOrder: 'asc' },
    });
    return media.map((entry) => this.toDto(entry));
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
    return {
      id: media.id,
      status: media.status,
      thumbUrl: media.thumbKey ? this.storage.publicUrl(media.thumbKey) : null,
      cardUrl: media.cardKey ? this.storage.publicUrl(media.cardKey) : null,
      fullUrl: media.fullKey ? this.storage.publicUrl(media.fullKey) : null,
      blurhash: media.blurhash,
      sortOrder: media.sortOrder,
      isPrimary: media.isPrimary,
      failureReason: media.failureReason,
    };
  }
}
