import { Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SellerProfileDto } from './dto/seller-profile.dto';

/**
 * A seller a stranger is about to contact needs enough context to leave one alone.
 *
 * Below this many answered conversations, a response rate is a number about a coin toss.
 * Two out of two is 100% and means nothing; showing it would be a claim we invented.
 */
const MIN_CONVERSATIONS_FOR_RATE = 5;

/** Anything older than this describes a person who has since changed how they behave. */
const RESPONSE_WINDOW_DAYS = 90;

/**
 * What LocZ can honestly say about a seller.
 *
 * Everything here is derived from what the platform observed, never from what the seller
 * typed about themselves — and every field is either a plain fact or absent. A response rate
 * over three conversations is not a rate; a "usually replies quickly" badge earned by one
 * fast answer is a recommendation we cannot stand behind. Buyers are being asked to meet a
 * stranger and hand over cash, so a number we would have to caveat is worse than a blank.
 *
 * Deliberately not here: the phone number, unless the owner published it on a specific
 * listing, and the email, ever. Neither is a seller's to lose because someone opened a
 * profile page.
 */
@Injectable()
export class SellerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<SellerProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, displayName: true, bio: true, createdAt: true, status: true },
    });

    // A suspended or deactivated seller is not shown at all, rather than shown with a
    // marker. The marker would be a public accusation on a page they cannot answer.
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Seller not found');
    }

    const since = new Date(Date.now() - RESPONSE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [published, sold, conversations] = await Promise.all([
      this.prisma.listing.count({
        where: { ownerId: userId, status: ListingStatus.PUBLISHED, deletedAt: null },
      }),
      this.prisma.listing.count({
        where: { ownerId: userId, status: ListingStatus.SOLD, deletedAt: null },
      }),
      // Only conversations somebody else started: a seller cannot fail to answer a question
      // nobody asked, and counting their own outgoing enquiries would inflate the rate.
      this.prisma.conversation.findMany({
        where: { recipientId: userId, createdAt: { gte: since } },
        select: { id: true },
      }),
    ]);

    return {
      id: user.id,
      displayName: user.displayName,
      bio: user.bio,
      memberSince: user.createdAt,
      publishedListings: published,
      soldListings: sold,
      ...(await this.responsiveness(
        userId,
        conversations.map((conversation) => conversation.id),
      )),
    };
  }

  /**
   * How often, and how quickly, this seller replies.
   *
   * Both are null below the sample threshold rather than optimistic defaults. A missing rate
   * reads as "we do not know yet", which is true; a 100% earned from two conversations reads
   * as "reliable", which we have no basis for.
   */
  private async responsiveness(
    userId: string,
    conversationIds: string[],
  ): Promise<{ responseRate: number | null; medianResponseMinutes: number | null }> {
    if (conversationIds.length < MIN_CONVERSATIONS_FOR_RATE) {
      return { responseRate: null, medianResponseMinutes: null };
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId: { in: conversationIds }, deletedAt: null },
      select: { conversationId: true, senderId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const firstEnquiry = new Map<string, Date>();
    const firstReply = new Map<string, Date>();

    for (const message of messages) {
      if (message.senderId === userId) {
        // Only a reply that came *after* a question counts. A seller messaging first — say,
        // reopening an old thread — is not evidence they answer anybody.
        if (firstEnquiry.has(message.conversationId) && !firstReply.has(message.conversationId)) {
          firstReply.set(message.conversationId, message.createdAt);
        }
      } else if (!firstEnquiry.has(message.conversationId)) {
        firstEnquiry.set(message.conversationId, message.createdAt);
      }
    }

    const asked = [...firstEnquiry.keys()];
    if (asked.length < MIN_CONVERSATIONS_FOR_RATE) {
      return { responseRate: null, medianResponseMinutes: null };
    }

    const answered = asked.filter((id) => firstReply.has(id));
    const delays = answered
      .map((id) => (firstReply.get(id)!.getTime() - firstEnquiry.get(id)!.getTime()) / 60_000)
      .sort((a, b) => a - b);

    return {
      responseRate: Math.round((answered.length / asked.length) * 100),
      // Median, not mean: one seller who answered a fortnight later would drag an average
      // into uselessness, while the median still describes the typical wait.
      medianResponseMinutes: delays.length > 0 ? Math.round(delays[Math.floor(delays.length / 2)]!) : null,
    };
  }
}
