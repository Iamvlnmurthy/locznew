import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Listing,
  ListingStatus,
  ListingType,
  NotificationType,
  Prisma,
  RequirementResponseKind,
} from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { ConversationsService } from '../conversations/conversations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequirementResponseDto, RespondToRequirementDto } from './dto/requirement.dto';

/**
 * How many sellers hear about any one requirement.
 *
 * Not a technical limit — a courtesy one. Telling every seller in a city about every
 * requirement is how people turn notifications off entirely, and they take their listing and
 * chat alerts with them when they go. Nearest first, because a buyer who wants something
 * today is not served by a shop across the city.
 */
const MAX_SELLERS_NOTIFIED = 25;

/**
 * The buyer-demand half of the marketplace.
 *
 * "Buyers post what they need. Sellers post what they have. LocZ connects them nearby." The
 * second sentence has worked for a while. This is the connecting verb: sellers are told a
 * requirement exists, they answer it in a structured way, and the buyer can compare answers
 * without opening six conversations.
 *
 * A response is not a message. A buyer scanning replies wants to see "available, 1,400"
 * beside "can arrange, by Friday" at a glance; the chat is where the deal is done, and this
 * is how it starts.
 */
@Injectable()
export class RequirementsService {
  private readonly logger = new Logger(RequirementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * A seller answers a buyer's requirement.
   *
   * The database holds the anti-spam rule — one response per seller per requirement, by
   * unique index. Answering twice updates the first answer rather than adding a second,
   * because a seller whose price changed is not spamming and should not have to withdraw and
   * re-post to say so.
   */
  async respond(
    userId: string,
    listingId: string,
    dto: RespondToRequirementDto,
  ): Promise<RequirementResponseDto> {
    const requirement = await this.requireOpenRequirement(listingId);

    if (requirement.ownerId === userId) {
      throw new BadRequestException('You cannot answer your own requirement');
    }

    // Answering on behalf of a business has to be an entitlement, not a claim: otherwise
    // anyone could put a shop's name on their reply.
    if (dto.businessId) await this.assertCanActForBusiness(userId, dto.businessId);

    // The offered listing must be the seller's own. Pointing at somebody else's listing
    // would let a response advertise a stranger's goods to a buyer who never asked.
    if (dto.offeredListingId) {
      const offered = await this.prisma.listing.findFirst({
        where: { id: dto.offeredListingId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      if (!offered) throw new BadRequestException('That listing is not yours to offer');
    }

    const existing = await this.prisma.requirementResponse.findUnique({
      where: { listingId_responderId: { listingId, responderId: userId } },
    });

    const data = {
      kind: dto.kind,
      offeredPrice: dto.offeredPrice !== undefined ? new Prisma.Decimal(dto.offeredPrice) : null,
      availableFrom: dto.availableFrom ?? null,
      message: dto.message?.trim() || null,
      offeredListingId: dto.offeredListingId ?? null,
      businessId: dto.businessId ?? null,
      withdrawnAt: null,
    };

    const response = existing
      ? await this.prisma.requirementResponse.update({ where: { id: existing.id }, data })
      : // The count and the row move together. Counted separately, a failure between them
        // leaves a requirement claiming replies it does not have — and the buyer opens it to
        // find nothing, which reads as the feature being broken.
        await this.prisma.$transaction(async (tx) => {
          const created = await tx.requirementResponse.create({
            data: { id: uuid(), listingId, responderId: userId, ...data },
          });
          await tx.buyerRequirementDetail.update({
            where: { listingId },
            data: { responseCount: { increment: 1 } },
          });
          return created;
        });

    // Only a new answer is announced. An edited one is not news, and telling the buyer twice
    // about the same seller is exactly the noise that teaches people to ignore alerts.
    if (!existing) {
      await this.notifyBuyer(requirement, dto.kind);
    }

    return this.toDto(response);
  }

  /**
   * Everyone who answered, for the buyer; your own answer, for a seller.
   *
   * A seller cannot read the competition. Showing them what everyone else offered would turn
   * a buyer's requirement into a price-discovery tool for sellers, which is not what the
   * buyer posted it for.
   */
  async listResponses(listingId: string, userId: string): Promise<RequirementResponseDto[]> {
    const requirement = await this.requireRequirement(listingId);
    const isBuyer = requirement.ownerId === userId;

    const responses = await this.prisma.requirementResponse.findMany({
      where: {
        listingId,
        withdrawnAt: null,
        ...(isBuyer ? {} : { responderId: userId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return responses.map((response) => this.toDto(response));
  }

  /** A seller takes their answer back — the item sold, or they misread the requirement. */
  async withdraw(userId: string, responseId: string): Promise<void> {
    const response = await this.prisma.requirementResponse.findFirst({
      where: { id: responseId, responderId: userId },
    });
    if (!response) throw new NotFoundException('Response not found');
    if (response.withdrawnAt) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.requirementResponse.update({
        where: { id: responseId },
        data: { withdrawnAt: new Date() },
      });
      await tx.buyerRequirementDetail.update({
        where: { listingId: response.listingId },
        data: { responseCount: { decrement: 1 } },
      });
    });
  }

  /**
   * The buyer opens a conversation with one seller who answered.
   *
   * Routed through `ConversationsService.start` rather than creating a conversation here, so
   * blocking, rate limiting and one-thread-per-listing all apply exactly as they do
   * everywhere else. A second way to make a conversation is a second set of rules to keep in
   * step, and the rules that would drift are the ones that stop harassment.
   */
  async openConversation(userId: string, responseId: string, message: string): Promise<string> {
    const response = await this.prisma.requirementResponse.findFirst({
      where: { id: responseId, withdrawnAt: null },
    });
    if (!response) throw new NotFoundException('Response not found');

    const requirement = await this.requireRequirement(response.listingId);
    if (requirement.ownerId !== userId) {
      throw new ForbiddenException('Only the buyer can open this conversation');
    }

    const conversation = await this.conversations.start(userId, {
      listingId: response.offeredListingId ?? undefined,
      businessId: response.offeredListingId ? undefined : (response.businessId ?? undefined),
      message,
    } as never);

    await this.prisma.requirementResponse.update({
      where: { id: responseId },
      data: { conversationId: conversation.id },
    });

    return conversation.id;
  }

  /**
   * The buyer closes their requirement.
   *
   * Kept, not deleted. A requirement that went unanswered is the most valuable thing this
   * platform learns: it names something people nearby wanted and nobody could supply.
   */
  async markFulfilled(userId: string, listingId: string, fulfilled: boolean): Promise<void> {
    const requirement = await this.requireRequirement(listingId);
    if (requirement.ownerId !== userId) {
      throw new ForbiddenException('This is not your requirement');
    }

    await this.prisma.buyerRequirementDetail.update({
      where: { listingId },
      data: { fulfilledAt: fulfilled ? new Date() : null },
    });
  }

  /**
   * Tells nearby sellers that somebody wants what they sell.
   *
   * Matched on category and city, which is the honest v1 signal: a seller who has published
   * in this category here has demonstrated they deal in it. Anything cleverer — keyword
   * overlap, inventory matching — needs inventory we do not model yet, and guessing would
   * mean notifying people about things they do not sell.
   *
   * Never throws to its caller. A failure here must not fail the posting: a requirement that
   * exists without alerts is a far smaller problem than one that could not be posted.
   */
  async notifyMatchingSellers(requirement: Listing): Promise<number> {
    try {
      if (requirement.type !== ListingType.BUYER_REQUIREMENT) return 0;

      const sellers = await this.prisma.listing.findMany({
        where: {
          status: ListingStatus.PUBLISHED,
          deletedAt: null,
          cityId: requirement.cityId,
          ownerId: { not: requirement.ownerId },
          OR: [
            { categoryId: requirement.categoryId },
            { subcategoryId: requirement.categoryId },
            ...(requirement.subcategoryId
              ? [
                  { categoryId: requirement.subcategoryId },
                  { subcategoryId: requirement.subcategoryId },
                ]
              : []),
          ],
        },
        select: { ownerId: true },
        distinct: ['ownerId'],
        take: MAX_SELLERS_NOTIFIED,
      });

      let notified = 0;
      for (const seller of sellers) {
        // Keyed on the requirement, so a seller with four listings in the category hears
        // about it once rather than four times.
        const sent = await this.notifications.createOnce({
          userId: seller.ownerId,
          type: NotificationType.REQUIREMENT_MATCH,
          title: 'Someone nearby is looking for this',
          body: requirement.title,
          data: { entityId: requirement.id, listingId: requirement.id },
        });
        if (sent) notified += 1;
      }

      if (notified > 0) {
        this.logger.log(`Requirement ${requirement.id} announced to ${notified} seller(s)`);
      }
      return notified;
    } catch (error) {
      this.logger.error(
        `Could not announce requirement ${requirement.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  // ------------------------------------------------------------------ helpers

  private async requireRequirement(listingId: string): Promise<Listing> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, type: ListingType.BUYER_REQUIREMENT, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Requirement not found');
    return listing;
  }

  /** Live, and not already closed by the buyer. */
  private async requireOpenRequirement(listingId: string): Promise<Listing> {
    const listing = await this.requireRequirement(listingId);
    if (listing.status !== ListingStatus.PUBLISHED) {
      throw new BadRequestException('This requirement is not accepting responses');
    }

    const detail = await this.prisma.buyerRequirementDetail.findUnique({ where: { listingId } });
    if (detail?.fulfilledAt) {
      throw new BadRequestException('This buyer has already found what they needed');
    }

    return listing;
  }

  private async assertCanActForBusiness(userId: string, businessId: string): Promise<void> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null, isActive: true },
      select: { ownerId: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    if (business.ownerId === userId) return;

    const staff = await this.prisma.businessStaff.findFirst({ where: { businessId, userId } });
    if (!staff) throw new ForbiddenException('You cannot answer on behalf of that business');
  }

  private async notifyBuyer(requirement: Listing, kind: RequirementResponseKind): Promise<void> {
    // Not `createOnce`: several sellers answering is several pieces of news, and the buyer
    // wants to know each time somebody can help.
    await this.notifications.create({
      userId: requirement.ownerId,
      type: NotificationType.REQUIREMENT_RESPONSE,
      title: 'A seller answered your requirement',
      body: requirement.title,
      data: { entityId: requirement.id, listingId: requirement.id, kind },
    });
  }

  private toDto(response: {
    id: string;
    listingId: string;
    responderId: string;
    businessId: string | null;
    kind: RequirementResponseKind;
    offeredPrice: Prisma.Decimal | null;
    availableFrom: Date | null;
    message: string | null;
    offeredListingId: string | null;
    conversationId: string | null;
    createdAt: Date;
  }): RequirementResponseDto {
    return {
      id: response.id,
      listingId: response.listingId,
      responderId: response.responderId,
      businessId: response.businessId,
      kind: response.kind,
      offeredPrice: response.offeredPrice ? Number(response.offeredPrice) : null,
      availableFrom: response.availableFrom,
      message: response.message,
      offeredListingId: response.offeredListingId,
      conversationId: response.conversationId,
      createdAt: response.createdAt,
    };
  }
}
