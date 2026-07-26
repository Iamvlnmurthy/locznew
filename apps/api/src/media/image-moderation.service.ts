import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ListingMedia, ListingStatus, ModerationStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { v7 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_REMOVE_LISTING, QUEUE_SEARCH } from '../queue/queue.constants';
import { ImageFingerprint, SAME_IMAGE_DISTANCE, hammingDistance } from './image-fingerprint';

export interface ImageUploadDecision {
  decision: 'APPROVE' | 'REVIEW';
  reasons: string[];
}

/**
 * What LocZ can and cannot tell about a photograph.
 *
 * **It cannot see what the picture shows.** There is no classifier here, and adding a
 * plausible-looking one would be worse than having none: a moderation control that is
 * believed and does not work is how illegal material stays up while everyone assumes it is
 * being handled. Content classification needs a licensed provider — Google Cloud Vision
 * SafeSearch, AWS Rekognition, Hive — and detection of child sexual abuse material needs
 * PhotoDNA or Thorn, which are access-controlled for good reason and are not something a
 * platform can approximate. `docs/MODERATION.md` records what must be procured before
 * launch and the reporting duties that come with it.
 *
 * What it can do is make a moderator's decision stick, and surface the patterns that
 * usually accompany a bad listing:
 *
 *   - the same photograph, re-uploaded after removal, is refused
 *   - the same photograph appearing under a different account is flagged, because a stolen
 *     photograph is the commonest sign of a listing for something the seller has not got
 *   - any image at all from an account with no history pulls the listing back for review,
 *     since the words were judged before the pictures existed
 */
@Injectable()
export class ImageModerationService {
  private readonly logger = new Logger(ImageModerationService.name);

  /** An account with fewer published listings than this has not earned the benefit of doubt. */
  private static readonly TRUSTED_AFTER_PUBLISHED = 3;

  constructor(
    private readonly prisma: PrismaService,
    // The queue directly rather than SearchIndexPublisher: that lives in SearchModule,
    // which imports MediaModule to build its documents, and importing it back would put
    // media and search in a cycle. The queue itself depends on nothing.
    @InjectQueue(QUEUE_SEARCH) private readonly searchQueue: Queue,
  ) {}

  /**
   * Has a moderator already refused this picture?
   *
   * The exact hash is one indexed lookup. The perceptual comparison cannot be — Hamming
   * distance is not something an index answers — so the blocked list is read and compared
   * in memory. That is affordable because the list is small by construction: it holds
   * images a human has explicitly refused, not everything ever uploaded.
   */
  async findBlock(
    fingerprint: ImageFingerprint,
  ): Promise<{ reason: string; category: string | null } | null> {
    const exact = await this.prisma.blockedImageHash.findUnique({
      where: { kind_hash: { kind: 'SHA256', hash: fingerprint.sha256 } },
      select: { reason: true, category: true },
    });
    if (exact) return exact;

    // A blank or near-blank picture reduces to sixty-four zero bits, the same as every
    // other blank picture. Comparing on that would mean one blocked placeholder quietly
    // refuses every plain background anyone uploads afterwards, with the uploader told
    // their photograph was previously removed. The exact hash above still applies.
    if (!fingerprint.distinctive) return null;

    const perceptual = await this.prisma.blockedImageHash.findMany({
      where: { kind: 'PERCEPTUAL' },
      select: { hash: true, reason: true, category: true },
    });

    for (const candidate of perceptual) {
      if (hammingDistance(candidate.hash, fingerprint.perceptual) <= SAME_IMAGE_DISTANCE) {
        return { reason: candidate.reason, category: candidate.category };
      }
    }

    return null;
  }

  /**
   * Decides whether a newly uploaded image should send its listing back for review.
   *
   * A published listing being pulled back is deliberate and is the point of this: the text
   * was judged before any picture existed, so publication was a decision made without the
   * evidence.
   */
  async reviewOnUpload(
    media: ListingMedia,
    fingerprint: ImageFingerprint,
    requiredReasons: string[] = [],
  ): Promise<ImageUploadDecision> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: media.listingId },
      select: { id: true, ownerId: true, status: true, moderationStatus: true },
    });
    if (!listing) return { decision: 'REVIEW', reasons: ['LISTING_NOT_FOUND'] };

    const reasons: string[] = [...requiredReasons];

    // The same photograph under a different owner. Not proof of anything — a shop and its
    // employee legitimately share pictures — but the strongest single signal that a
    // listing is for something the seller does not have.
    const elsewhere = await this.prisma.listingMedia.findFirst({
      where: {
        sha256: fingerprint.sha256,
        id: { not: media.id },
        listing: { ownerId: { not: listing.ownerId }, deletedAt: null },
      },
      select: { listingId: true },
    });
    if (elsewhere) reasons.push('IMAGE_USED_BY_ANOTHER_ACCOUNT');

    const published = await this.prisma.listing.count({
      where: { ownerId: listing.ownerId, status: ListingStatus.PUBLISHED },
    });
    if (published < ImageModerationService.TRUSTED_AFTER_PUBLISHED) {
      reasons.push('IMAGE_FROM_NEW_ACCOUNT');
    }

    if (reasons.length === 0) return { decision: 'APPROVE', reasons };

    // Only a live listing is worth pulling back; one already waiting for review is where
    // it needs to be, and one already refused should not be quietly resurrected.
    if (listing.status === ListingStatus.PUBLISHED) {
      await this.prisma.listing.update({
        where: { id: listing.id },
        data: { status: ListingStatus.PENDING_REVIEW, moderationStatus: ModerationStatus.PENDING },
      });
      // Leaving the index matters as much as leaving the shelf: a listing pulled back for
      // review must stop being findable, not merely stop being openable.
      await this.searchQueue
        .add(
          JOB_REMOVE_LISTING,
          { listingId: listing.id },
          { jobId: `remove-${listing.id}`, removeOnComplete: true },
        )
        .catch((error: unknown) => {
          this.logger.error(
            `Could not remove ${listing.id} from the index: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }

    this.logger.warn(
      `Listing ${listing.id} returned to review after an image was added: ${reasons.join(', ')}`,
    );
    return { decision: 'REVIEW', reasons };
  }

  /**
   * Refuses this picture from now on.
   *
   * Both hashes are recorded. The exact one is certain; the perceptual one is what stops
   * the same photograph returning through a screenshot or a re-crop, which is the usual
   * next move.
   */
  async blockImage(
    mediaId: string,
    moderatorId: string,
    reason: string,
    category?: string,
  ): Promise<{ blocked: number }> {
    const media = await this.prisma.listingMedia.findUnique({
      where: { id: mediaId },
      select: { sha256: true, perceptualHash: true },
    });

    if (!media?.sha256 || !media.perceptualHash) {
      // An image that never finished processing has no fingerprint to block.
      return { blocked: 0 };
    }

    const rows = [
      { kind: 'SHA256', hash: media.sha256 },
      { kind: 'PERCEPTUAL', hash: media.perceptualHash },
    ];

    for (const row of rows) {
      await this.prisma.blockedImageHash.upsert({
        where: { kind_hash: { kind: row.kind, hash: row.hash } },
        update: { reason, category: category ?? null, blockedById: moderatorId },
        create: {
          id: uuid(),
          kind: row.kind,
          hash: row.hash,
          reason,
          category: category ?? null,
          blockedById: moderatorId,
        },
      });
    }

    this.logger.warn(`Image ${mediaId} blocked by ${moderatorId}: ${reason}`);
    return { blocked: rows.length };
  }
}
