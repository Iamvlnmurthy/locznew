import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BusinessClaimStatus,
  BusinessScale,
  ClaimReviewStatus,
  NotificationType,
  OfferingType,
  Prisma,
} from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { distanceInMetres, matchedSignals, qualifiesForAutoApproval } from './claim-signals';

/**
 * How near an existing record has to be to be worth suggesting.
 *
 * Wider than the fifty metres that grants a claim, on purpose: that threshold decides a
 * handover, this one decides whether somebody sees a card they can dismiss.
 */
const SUGGESTION_RADIUS_METRES = 200;

/** Enough to recognise their own shop, few enough to read before giving up. */
const MAX_SUGGESTIONS = 5;

/** Shop names vary in punctuation and honorifics far more than they vary in words. */
function sameName(a: string, b: string): boolean {
  const normalise = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/(the|shop|store|and|co|pvt|ltd)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const left = normalise(a);
  const right = normalise(b);
  if (!left || !right) return false;

  return left === right || left.includes(right) || right.includes(left);
}
import { paginate, PaginatedDto } from '../common/dto/pagination.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Taking over an imported directory record.
 *
 * The whole four-million-business directory rests on this. A scraped record is worth nothing
 * to the shop it describes until that shop can control it, and worth little to a buyer until
 * a person has stood behind it. Everything else about the directory — verification badges,
 * keywords, replying to enquiries — is downstream of somebody being able to say "this is mine".
 *
 * Claims are reviewed by a human rather than granted on the spot. Approving one hands over a
 * business's listings, its enquiries and its identity in search, and the only evidence at this
 * point is text typed into a form. Granting automatically would make impersonating a shop a
 * question of who asks first, which is precisely the attack the directory invites: the records
 * are public, so anybody can see exactly which businesses exist and have no owner yet.
 */
@Injectable()
export class BusinessClaimsService {
  private readonly logger = new Logger(BusinessClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * How many people asked about this shop recently and got no answer.
   *
   * The only honest reason to claim a record. "Claim your free listing" is a favour the
   * platform is asking for; "four people asked about your shop this week and nobody could
   * answer them" is a fact about their business, and it is the fact that makes an unclaimed
   * page worth taking control of.
   *
   * Counts requirements raised from the business's own page, not everything nearby — a
   * number inflated with unrelated demand would be a sales figure rather than a fact, and the
   * first shopkeeper who checked would stop believing the rest of it.
   */
  async enquiryCount(businessId: string, withinDays = 30): Promise<number> {
    const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

    return this.prisma.listing.count({
      where: {
        promptedByBusinessId: businessId,
        createdAt: { gte: since },
        deletedAt: null,
      },
    });
  }

  /**
   * Imported records that look like the business somebody is about to create.
   *
   * A shopkeeper whose shop is already in the directory has no way to know that. Left alone
   * they create a second record, and the platform ends up holding two entries for one shop:
   * the real owner on a new empty page, and their actual shop sitting unclaimed with the
   * search traffic. Claiming the existing record is better for them and for every buyer.
   *
   * Suggestion only. Nothing is created, nothing is merged, and the seller can ignore all of
   * it — a duplicate check that blocks people from registering would be worse than the
   * duplicates. Ordered by how confident the match is, closest first.
   */
  async findPossibleMatches(input: {
    name: string;
    latitude?: number;
    longitude?: number;
    phone?: string;
    cityId?: string;
  }): Promise<
    Array<{ id: string; slug: string; name: string; distanceM: number | null; matchedOn: string[] }>
  > {
    const phoneDigits = input.phone?.replace(/\D/g, '').slice(-10);

    // A deliberately wide net: this is a suggestion list, so a near miss costs a glance while
    // a miss costs a duplicate record forever. Unclaimed only — a business with an owner is
    // not something to suggest taking over.
    const candidates = await this.prisma.business.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ownerId: null,
        OR: [
          { name: { contains: input.name.trim().split(/\s+/)[0] ?? '', mode: 'insensitive' } },
          ...(phoneDigits && phoneDigits.length === 10
            ? [
                { primaryPhone: { endsWith: phoneDigits } },
                { whatsappNumber: { endsWith: phoneDigits } },
              ]
            : []),
          ...(input.cityId ? [{ cityId: input.cityId }] : []),
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        primaryPhone: true,
        whatsappNumber: true,
        latitude: true,
        longitude: true,
      },
      // Bounded because the OR above can be broad in a dense city. Ranking happens below on
      // the facts that actually matter, not on whatever order the database returned.
      take: 200,
    });

    const scored = candidates
      .map((candidate) => {
        const matchedOn: string[] = [];

        if (sameName(candidate.name, input.name)) matchedOn.push('NAME');

        if (
          phoneDigits &&
          [candidate.primaryPhone, candidate.whatsappNumber].some(
            (number) => number?.replace(/\D/g, '').slice(-10) === phoneDigits,
          )
        ) {
          matchedOn.push('PHONE');
        }

        const distanceM =
          input.latitude != null &&
          input.longitude != null &&
          candidate.latitude != null &&
          candidate.longitude != null
            ? distanceInMetres(
                { latitude: input.latitude, longitude: input.longitude },
                { latitude: Number(candidate.latitude), longitude: Number(candidate.longitude) },
              )
            : null;

        // Wider than the 50 m used to grant a claim. That threshold decides a handover; this
        // one only decides whether to show somebody a card they can dismiss.
        if (distanceM != null && distanceM <= SUGGESTION_RADIUS_METRES) matchedOn.push('LOCATION');

        return { ...candidate, distanceM, matchedOn };
      })
      // One coincidence is not a suggestion. Sharing a city with a shop whose name starts with
      // the same word would otherwise fill the list with noise.
      .filter((candidate) => candidate.matchedOn.length >= 2)
      .sort(
        (a, b) =>
          b.matchedOn.length - a.matchedOn.length ||
          (a.distanceM ?? Number.POSITIVE_INFINITY) - (b.distanceM ?? Number.POSITIVE_INFINITY),
      )
      .slice(0, MAX_SUGGESTIONS);

    return scored.map((candidate) => ({
      id: candidate.id,
      slug: candidate.slug,
      name: candidate.name,
      distanceM: candidate.distanceM === null ? null : Math.round(candidate.distanceM),
      matchedOn: candidate.matchedOn,
    }));
  }

  /**
   * Files a claim.
   *
   * Only a business nobody owns can be claimed. A business with an owner is not disputed
   * territory this flow can settle — that is a support and moderation question, with evidence
   * on both sides, and quietly reassigning it here would be a takeover mechanism.
   */
  async create(
    userId: string,
    businessId: string,
    input: {
      evidence: string;
      contactPhone?: string;
      scale: BusinessScale;
      offering: OfferingType;
      categoryId?: string;
      latitude?: number;
      longitude?: number;
      locationAccuracyM?: number;
    },
  ): Promise<{ id: string; status: ClaimReviewStatus }> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      select: {
        id: true,
        name: true,
        ownerId: true,
        claimStatus: true,
        primaryPhone: true,
        whatsappNumber: true,
        email: true,
        latitude: true,
        longitude: true,
      },
    });

    if (!business) throw new NotFoundException('That business does not exist.');

    if (business.ownerId) {
      throw new ConflictException(
        'That business already has an owner. If you believe it is yours, report it instead.',
      );
    }

    const existing = await this.prisma.businessClaim.findFirst({
      where: { businessId, claimantId: userId, status: ClaimReviewStatus.PENDING },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('You have already claimed this business. It is being reviewed.');
    }

    const claimant = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phoneE164: true, phoneVerifiedAt: true, email: true, emailVerifiedAt: true },
    });

    // Evidence rather than prose. Each check below matches something the platform already
    // holds against something the claimant has proved is theirs, and two independent ones
    // mean an impersonator has to defeat two mechanisms at once rather than write well.
    const signals = matchedSignals(
      claimant,
      {
        primaryPhone: business.primaryPhone,
        whatsappNumber: business.whatsappNumber,
        email: business.email,
        latitude: business.latitude === null ? null : Number(business.latitude),
        longitude: business.longitude === null ? null : Number(business.longitude),
      },
      {
        latitude: input.latitude,
        longitude: input.longitude,
        locationAccuracyM: input.locationAccuracyM,
      },
    );

    const automatic = qualifiesForAutoApproval(signals);

    const claim = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.businessClaim.create({
        data: {
          id: uuid(),
          businessId,
          claimantId: userId,
          evidence: input.evidence.trim(),
          contactPhone: input.contactPhone ?? null,
          // Recorded, not applied. The owner is the first person able to correct an imported
          // record, but an unreviewed claim rewriting a live business would turn this form
          // into an edit form for businesses nobody owns yet.
          proposedScale: input.scale,
          offeringProposed: input.offering,
          proposedCategoryId: input.categoryId ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          locationAccuracyM: input.locationAccuracyM ?? null,
          // Recorded whether or not it was enough. When a handover later turns out to be
          // wrong this is the only record of why the platform believed it.
          matchedSignals: signals,
          autoApproved: automatic,
          ...(automatic ? { status: ClaimReviewStatus.APPROVED, reviewedAt: new Date() } : {}),
        },
        select: { id: true, status: true },
      });

      if (automatic) {
        // Guarded on ownerId still being null rather than read-then-write: two claimants can
        // both satisfy two signals for the same shop, and the loser must not silently
        // overwrite the winner. updateMany returns a count, so a race is detectable.
        const handed = await transaction.business.updateMany({
          where: { id: businessId, ownerId: null },
          data: {
            ownerId: userId,
            claimStatus: BusinessClaimStatus.CLAIMED,
            scale: input.scale,
            offering: input.offering,
            ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          },
        });

        if (handed.count === 0) {
          throw new ConflictException('That business was claimed a moment ago.');
        }

        return created;
      }

      // The business shows as pending so a buyer looking at it now knows somebody is in the
      // process of standing behind it, and so a second claimant sees it is already contested.
      // Only from UNCLAIMED: a record somebody created themselves is not in this flow at all.
      await transaction.business.updateMany({
        where: { id: businessId, claimStatus: BusinessClaimStatus.UNCLAIMED },
        data: { claimStatus: BusinessClaimStatus.CLAIM_PENDING },
      });

      return created;
    });

    await this.audit.record({
      action: automatic ? 'business.claim.auto-approve' : 'business.claim.create',
      entityType: 'BusinessClaim',
      entityId: claim.id,
      actorId: userId,
      changes: { businessId, businessName: business.name, matchedSignals: signals },
    });

    if (automatic) {
      await this.notify(
        userId,
        'Your business is yours',
        `You now manage ${business.name} on LocZ. Add your hours, photos and what you sell.`,
        businessId,
      );
      this.logger.log(
        `Claim ${claim.id} auto-approved for business ${businessId} on [${signals.join(', ')}]`,
      );
      return { id: claim.id, status: ClaimReviewStatus.APPROVED };
    }

    this.logger.log(`Claim ${claim.id} filed for business ${businessId}`);
    return claim;
  }

  /** The claims a person has filed, so they can see where each one stands. */
  async listMine(userId: string, page = 1, limit = 20): Promise<PaginatedDto<unknown>> {
    const where: Prisma.BusinessClaimWhereInput = { claimantId: userId };

    const [items, total] = await Promise.all([
      this.prisma.businessClaim.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { business: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.businessClaim.count({ where }),
    ]);

    return paginate(
      items.map((claim) => ({
        id: claim.id,
        status: claim.status,
        business: claim.business,
        rejectionReason: claim.rejectionReason,
        createdAt: claim.createdAt,
        reviewedAt: claim.reviewedAt,
      })),
      total,
      page,
      limit,
    );
  }

  /** The review queue. Oldest first, because a claim nobody looks at is a shop nobody joins. */
  async listForReview(
    status: ClaimReviewStatus = ClaimReviewStatus.PENDING,
    page = 1,
    limit = 20,
  ): Promise<PaginatedDto<unknown>> {
    const where: Prisma.BusinessClaimWhereInput = { status };

    const [items, total] = await Promise.all([
      this.prisma.businessClaim.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          business: {
            select: { id: true, name: true, slug: true, primaryPhone: true, sourceName: true },
          },
          claimant: { select: { id: true, displayName: true, phoneE164: true, email: true } },
        },
      }),
      this.prisma.businessClaim.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  /**
   * Approves a claim and hands the business over.
   *
   * One transaction, because a half-applied approval is the worst of both outcomes: an owner
   * recorded on a business that still reads as unclaimed, or a claim marked approved that
   * never transferred anything. Competing claims are closed in the same breath — leaving them
   * pending would offer a reviewer the chance to hand the same shop to two people.
   */
  async approve(reviewerId: string, claimId: string): Promise<void> {
    const claim = await this.loadPending(claimId);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.businessClaim.update({
        where: { id: claimId },
        data: {
          status: ClaimReviewStatus.APPROVED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      });

      await transaction.business.update({
        where: { id: claim.businessId },
        data: {
          ownerId: claim.claimantId,
          claimStatus: BusinessClaimStatus.CLAIMED,
          // What the claimant told us the business is, applied now that a reviewer has agreed
          // it is theirs. The category only moves if they proposed a different one — an
          // imported category inferred from map tags is a guess, but so is overwriting it
          // with nothing.
          scale: claim.proposedScale,
          offering: claim.offeringProposed,
          ...(claim.proposedCategoryId ? { categoryId: claim.proposedCategoryId } : {}),
        },
      });

      // Everybody else who wanted this shop is refused now, with a reason, rather than left
      // waiting on a queue that can no longer produce an answer for them.
      await transaction.businessClaim.updateMany({
        where: {
          businessId: claim.businessId,
          status: ClaimReviewStatus.PENDING,
          id: { not: claimId },
        },
        data: {
          status: ClaimReviewStatus.REJECTED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: 'Another claim for this business was approved.',
        },
      });
    });

    await this.audit.record({
      action: 'business.claim.approve',
      entityType: 'BusinessClaim',
      entityId: claimId,
      actorId: reviewerId,
      changes: { businessId: claim.businessId, newOwnerId: claim.claimantId },
    });

    await this.notify(
      claim.claimantId,
      'Your business is yours',
      `You now manage ${claim.business.name} on LocZ. Add your hours, photos and what you sell.`,
      claim.businessId,
    );

    this.logger.log(`Claim ${claimId} approved; business ${claim.businessId} handed over`);
  }

  /**
   * Refuses a claim, with a reason the claimant can read.
   *
   * The reason is required. A rejection nobody can explain is one nobody can appeal, and the
   * person on the other end is usually a shopkeeper who genuinely does own the shop and simply
   * did not say anything that showed it.
   */
  async reject(reviewerId: string, claimId: string, reason: string): Promise<void> {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      throw new BadRequestException('Give a reason the claimant can act on.');
    }

    const claim = await this.loadPending(claimId);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.businessClaim.update({
        where: { id: claimId },
        data: {
          status: ClaimReviewStatus.REJECTED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: trimmed,
        },
      });

      await this.releaseIfUncontested(transaction, claim.businessId);
    });

    await this.audit.record({
      action: 'business.claim.reject',
      entityType: 'BusinessClaim',
      entityId: claimId,
      actorId: reviewerId,
      changes: { businessId: claim.businessId, reason: trimmed },
    });

    await this.notify(
      claim.claimantId,
      'Your claim was not approved',
      `${claim.business.name}: ${trimmed}`,
      claim.businessId,
    );
  }

  /** The claimant changing their mind. Only their own, and only while it is still pending. */
  async withdraw(userId: string, claimId: string): Promise<void> {
    const claim = await this.prisma.businessClaim.findFirst({
      where: { id: claimId, claimantId: userId, status: ClaimReviewStatus.PENDING },
      select: { id: true, businessId: true },
    });

    if (!claim) throw new NotFoundException('No pending claim of yours with that id.');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.businessClaim.update({
        where: { id: claimId },
        data: { status: ClaimReviewStatus.WITHDRAWN },
      });

      await this.releaseIfUncontested(transaction, claim.businessId);
    });
  }

  /**
   * Puts a business back to unclaimed once no claim is outstanding.
   *
   * Without this a single withdrawn or rejected claim would leave the record reading as
   * pending for ever, which tells a buyer somebody is standing behind it when nobody is, and
   * discourages the real owner from claiming it.
   */
  private async releaseIfUncontested(
    transaction: Prisma.TransactionClient,
    businessId: string,
  ): Promise<void> {
    const stillPending = await transaction.businessClaim.count({
      where: { businessId, status: ClaimReviewStatus.PENDING },
    });

    if (stillPending === 0) {
      await transaction.business.updateMany({
        where: { id: businessId, claimStatus: BusinessClaimStatus.CLAIM_PENDING },
        data: { claimStatus: BusinessClaimStatus.UNCLAIMED },
      });
    }
  }

  private async loadPending(claimId: string) {
    const claim = await this.prisma.businessClaim.findUnique({
      where: { id: claimId },
      include: { business: { select: { name: true, ownerId: true } } },
    });

    if (!claim) throw new NotFoundException('No claim with that id.');
    if (claim.status !== ClaimReviewStatus.PENDING) {
      throw new ConflictException('That claim has already been decided.');
    }
    if (claim.business.ownerId) {
      // Somebody else took ownership between the queue being listed and this decision.
      throw new ConflictException('That business already has an owner.');
    }

    return claim;
  }

  /** Telling somebody is not worth failing the decision over — the decision is the record. */
  private async notify(
    userId: string,
    title: string,
    body: string,
    businessId: string,
  ): Promise<void> {
    try {
      await this.notifications.create({
        userId,
        type: NotificationType.BUSINESS_CLAIM_UPDATE,
        title,
        body,
        data: { entityId: businessId },
      });
    } catch (error) {
      this.logger.error(
        `Could not notify ${userId} about a claim: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
