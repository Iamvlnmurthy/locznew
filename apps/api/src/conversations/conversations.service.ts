import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationContext,
  ListingStatus,
  ListingType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { PaginatedDto, paginate } from '../common/dto/pagination.dto';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TooManyRequestsException } from '../common/exceptions/too-many-requests.exception';
import {
  ConversationDetailDto,
  ConversationSummaryDto,
  MessageDto,
  StartConversationDto,
} from './dto/conversation.dto';

/**
 * Messages returned when a thread is opened.
 *
 * Enough that scrolling back covers any real negotiation, few enough that the payload stays
 * small on a phone. Older messages are not lost — they are simply not in this response, and
 * a thread that needs more than this needs a cursor rather than a bigger number.
 */
const MESSAGE_PAGE_SIZE = 200;

const CONVERSATION_INCLUDE = {
  listing: {
    select: {
      id: true,
      title: true,
      type: true,
      media: { where: { isPrimary: true }, take: 1 },
    },
  },
  initiator: { select: { id: true, displayName: true } },
  recipient: { select: { id: true, displayName: true } },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;

/**
 * Lightweight in-app enquiries (Phase 1 scope — no real-time calling).
 *
 * Personal contact details are never exchanged automatically: the thread is the contact
 * channel unless the listing owner explicitly chose to publish a number.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly media: MediaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * The thread between a buyer and a seller about the buyer's requirement.
   *
   * `start` cannot express this: it derives the recipient from whoever owns the listing, and
   * here the listing is the buyer's own requirement. Both parties would resolve to the buyer.
   *
   * A separate entry point rather than a flag on `start`, but deliberately not a separate
   * implementation — it reuses the same blocking check, the same rate limit and the same
   * message append. A second set of conversation rules would drift from the first, and the
   * rules that would drift are the ones that stop harassment.
   */
  async startRequirementThread(
    initiatorId: string,
    recipientId: string,
    requirementListingId: string,
    message: string,
  ): Promise<ConversationDetailDto> {
    if (initiatorId === recipientId) {
      throw new BadRequestException('You cannot start a conversation with yourself');
    }

    await this.assertNotBlocked(initiatorId, recipientId);
    await this.assertEnquiryRateLimit(initiatorId);

    // One thread per pair per requirement, whichever of them opened it. Without this, a
    // buyer messaging a seller who had already messaged them would start a second thread and
    // neither would see the other's replies.
    const existing = await this.prisma.conversation.findFirst({
      where: {
        listingId: requirementListingId,
        context: ConversationContext.REQUIREMENT_ENQUIRY,
        OR: [
          { initiatorId, recipientId },
          { initiatorId: recipientId, recipientId: initiatorId },
        ],
      },
      include: CONVERSATION_INCLUDE,
    });

    const conversation =
      existing ??
      (await this.prisma.conversation.create({
        data: {
          id: uuid(),
          context: ConversationContext.REQUIREMENT_ENQUIRY,
          listingId: requirementListingId,
          initiatorId,
          recipientId,
        },
        include: CONVERSATION_INCLUDE,
      }));

    await this.appendMessage(conversation.id, initiatorId, message);
    return this.getDetail(conversation.id, initiatorId);
  }

  async start(userId: string, dto: StartConversationDto): Promise<ConversationDetailDto> {
    if (!dto.listingId && !dto.businessId) {
      throw new BadRequestException('An enquiry must reference a listing or a business');
    }

    const listing = dto.listingId
      ? await this.prisma.listing.findFirst({
          where: { id: dto.listingId, deletedAt: null },
          select: { id: true, ownerId: true, status: true, type: true, title: true },
        })
      : null;

    if (dto.listingId && !listing) throw new NotFoundException('Listing not found');
    if (listing && listing.status !== ListingStatus.PUBLISHED) {
      throw new BadRequestException('This listing is no longer accepting enquiries');
    }

    const business = dto.businessId
      ? await this.prisma.business.findFirst({
          where: { id: dto.businessId, deletedAt: null },
          select: { id: true, ownerId: true, isActive: true },
        })
      : null;

    if (dto.businessId && !business) throw new NotFoundException('Business not found');
    if (business && !business.isActive) {
      throw new BadRequestException('This business is no longer accepting enquiries');
    }

    const recipientId = listing?.ownerId ?? business?.ownerId;
    if (!recipientId) throw new BadRequestException('Could not determine who to contact');
    if (recipientId === userId) {
      throw new BadRequestException('You cannot send an enquiry about your own listing');
    }

    await this.assertNotBlocked(userId, recipientId);
    await this.assertEnquiryRateLimit(userId);

    const context = business
      ? ConversationContext.BUSINESS_ENQUIRY
      : listing?.type === ListingType.JOB
        ? ConversationContext.JOB_ENQUIRY
        : ConversationContext.LISTING_ENQUIRY;

    // One thread per buyer per listing — a repeat tap on "Message seller" continues the
    // existing conversation rather than starting a parallel one.
    const existing = dto.listingId
      ? await this.prisma.conversation.findUnique({
          where: { listingId_initiatorId: { listingId: dto.listingId, initiatorId: userId } },
          include: CONVERSATION_INCLUDE,
        })
      : dto.businessId
        ? await this.prisma.conversation.findFirst({
            where: { businessId: dto.businessId, initiatorId: userId, isClosed: false },
            include: CONVERSATION_INCLUDE,
          })
        : null;

    const conversation =
      existing ??
      (await this.prisma.conversation.create({
        data: {
          id: uuid(),
          context,
          listingId: dto.listingId ?? null,
          businessId: dto.businessId ?? null,
          initiatorId: userId,
          recipientId,
        },
        include: CONVERSATION_INCLUDE,
      }));

    await this.appendMessage(conversation.id, userId, dto.message);
    // Only when this actually opened a thread. Counting every tap of "Message seller"
    // inflated the figure with repeat visits by the same buyer, which is not what an enquiry
    // count means to the seller reading it.
    if (dto.listingId && !existing) {
      await this.prisma.listing.update({
        where: { id: dto.listingId },
        data: { enquiryCount: { increment: 1 } },
      });
    }

    return this.getDetail(conversation.id, userId);
  }

  async sendMessage(conversationId: string, userId: string, body: string): Promise<MessageDto> {
    const conversation = await this.requireParticipant(conversationId, userId);
    if (conversation.isClosed) {
      throw new BadRequestException('This conversation is closed');
    }

    const otherPartyId =
      conversation.initiatorId === userId ? conversation.recipientId : conversation.initiatorId;
    await this.assertNotBlocked(userId, otherPartyId);

    const message = await this.appendMessage(conversationId, userId, body);

    return {
      id: message.id,
      senderId: message.senderId,
      body: message.body,
      isMine: true,
      readAt: message.readAt,
      createdAt: message.createdAt,
    };
  }

  /**
   * Writes the message, updates the thread preview and unread counter, and notifies the
   * other party. The counter is denormalised so the conversation list needs no
   * per-thread COUNT query.
   */
  private async appendMessage(conversationId: string, senderId: string, body: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });

    const isInitiator = conversation.initiatorId === senderId;
    const recipientId = isInitiator ? conversation.recipientId : conversation.initiatorId;
    const trimmed = body.trim();

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { id: uuid(), conversationId, senderId, body: trimmed },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: trimmed.slice(0, 160),
          ...(isInitiator
            ? { recipientUnreadCount: { increment: 1 } }
            : { initiatorUnreadCount: { increment: 1 } }),
        },
      }),
    ]);

    const sender = isInitiator ? conversation.initiator : conversation.recipient;
    const isFirstMessage = conversation.lastMessageAt === null;

    await this.notifications.create({
      userId: recipientId,
      type: isFirstMessage ? NotificationType.NEW_ENQUIRY : NotificationType.NEW_MESSAGE,
      title: isFirstMessage
        ? conversation.context === ConversationContext.BUSINESS_ENQUIRY
          ? 'New enquiry about your business'
          : `New enquiry about "${conversation.listing?.title ?? 'your listing'}"`
        : `New message from ${sender.displayName}`,
      body: trimmed.slice(0, 140),
      data: {
        entityType: 'Conversation',
        entityId: conversationId,
        route: `/chats/${conversationId}`,
      },
    });

    return message;
  }

  async list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedDto<ConversationSummaryDto>> {
    const where: Prisma.ConversationWhereInput = {
      OR: [{ initiatorId: userId }, { recipientId: userId }],
      // A thread with no messages is an artefact, not a conversation.
      lastMessageAt: { not: null },
    };

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: CONVERSATION_INCLUDE,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return paginate(
      conversations.map((conversation) => this.toSummary(conversation, userId)),
      total,
      page,
      limit,
    );
  }

  /** Opening a thread marks the other party's messages as read. */
  async getDetail(conversationId: string, userId: string): Promise<ConversationDetailDto> {
    const conversation = await this.requireParticipant(conversationId, userId);
    const isInitiator = conversation.initiatorId === userId;

    /**
     * The most recent messages, not the oldest.
     *
     * `orderBy: 'asc'` with `take` returns the *first* 200, so once a buyer and seller passed
     * that many the thread froze: new messages were written, the unread counter moved, the
     * notification fired, and opening the conversation showed the same old screen. Read newest
     * first and reverse, so the window follows the conversation.
     */
    const recent = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: MESSAGE_PAGE_SIZE,
    });
    const messages = recent.reverse();

    await this.prisma.$transaction([
      this.prisma.message.updateMany({
        where: { conversationId, senderId: { not: userId }, readAt: null },
        data: { readAt: new Date() },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: isInitiator ? { initiatorUnreadCount: 0 } : { recipientUnreadCount: 0 },
      }),
    ]);

    return {
      ...this.toSummary(conversation, userId),
      unreadCount: 0,
      messages: messages.map((message) => ({
        id: message.id,
        senderId: message.senderId,
        body: message.body,
        isMine: message.senderId === userId,
        readAt: message.readAt,
        createdAt: message.createdAt,
      })),
    };
  }

  async unreadTotal(userId: string): Promise<number> {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ initiatorId: userId }, { recipientId: userId }] },
      select: { initiatorId: true, initiatorUnreadCount: true, recipientUnreadCount: true },
    });

    return conversations.reduce(
      (total, conversation) =>
        total +
        (conversation.initiatorId === userId
          ? conversation.initiatorUnreadCount
          : conversation.recipientUnreadCount),
      0,
    );
  }

  async block(userId: string, blockedId: string, reason?: string): Promise<void> {
    if (userId === blockedId) throw new BadRequestException('You cannot block yourself');

    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId } },
      update: { reason },
      create: { id: uuid(), blockerId: userId, blockedId, reason },
    });

    // Existing threads between the two are closed so neither side can keep writing.
    await this.prisma.conversation.updateMany({
      where: {
        OR: [
          { initiatorId: userId, recipientId: blockedId },
          { initiatorId: blockedId, recipientId: userId },
        ],
      },
      data: { isClosed: true },
    });
  }

  private async requireParticipant(
    conversationId: string,
    userId: string,
  ): Promise<ConversationRow> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });

    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.initiatorId !== userId && conversation.recipientId !== userId) {
      // Not "forbidden" in the message — a stranger should not learn the thread exists.
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  /** A block stops contact in both directions, whoever set it. */
  private async assertNotBlocked(userId: string, otherPartyId: string): Promise<void> {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherPartyId },
          { blockerId: otherPartyId, blockedId: userId },
        ],
      },
    });
    if (block) throw new ForbiddenException('You cannot message this user');
  }

  /**
   * Enquiry flood control. Messaging every seller in a city is a scraping and scam
   * pattern, and unlike posting it costs the sender nothing without this.
   */
  private async assertEnquiryRateLimit(userId: string): Promise<void> {
    const count = await this.redis.incrementWithWindow(`enquiry:${userId}`, 3600);
    if (count > 20) {
      throw new TooManyRequestsException('You have sent a lot of enquiries. Try again later.');
    }
  }

  private toSummary(conversation: ConversationRow, userId: string): ConversationSummaryDto {
    const isInitiator = conversation.initiatorId === userId;
    const otherParty = isInitiator ? conversation.recipient : conversation.initiator;
    const primaryMedia = conversation.listing?.media[0];

    return {
      id: conversation.id,
      context: conversation.context,
      listingId: conversation.listingId,
      listingTitle: conversation.listing?.title ?? null,
      listingThumbUrl: primaryMedia ? this.media.toDto(primaryMedia).thumbUrl : null,
      otherPartyId: otherParty.id,
      otherPartyName: otherParty.displayName,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: isInitiator
        ? conversation.initiatorUnreadCount
        : conversation.recipientUnreadCount,
      isInitiator,
    };
  }
}
