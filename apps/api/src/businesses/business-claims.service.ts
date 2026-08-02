import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BusinessClaimStatus, ClaimReviewStatus, NotificationType, Prisma } from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { AuditService } from '../audit/audit.service';
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
   * Files a claim.
   *
   * Only a business nobody owns can be claimed. A business with an owner is not disputed
   * territory this flow can settle — that is a support and moderation question, with evidence
   * on both sides, and quietly reassigning it here would be a takeover mechanism.
   */
  async create(
    userId: string,
    businessId: string,
    input: { evidence: string; contactPhone?: string },
  ): Promise<{ id: string; status: ClaimReviewStatus }> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      select: { id: true, name: true, ownerId: true, claimStatus: true },
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

    const claim = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.businessClaim.create({
        data: {
          id: uuid(),
          businessId,
          claimantId: userId,
          evidence: input.evidence.trim(),
          contactPhone: input.contactPhone ?? null,
        },
        select: { id: true, status: true },
      });

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
      action: 'business.claim.create',
      entityType: 'BusinessClaim',
      entityId: claim.id,
      actorId: userId,
      changes: { businessId, businessName: business.name },
    });

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
          claimant: { select: { id: true, name: true, phoneE164: true, email: true } },
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
