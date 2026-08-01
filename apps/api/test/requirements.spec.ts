import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ListingStatus, ListingType, NotificationType, RequirementResponseKind } from '@prisma/client';
import { RequirementsService } from '../src/requirements/requirements.service';

/**
 * The buyer-demand loop.
 *
 * "Buyers post what they need. Sellers post what they have. LocZ connects them nearby." These
 * cases cover the connecting verb: who may answer, who may read the answers, and what stops
 * the channel becoming a spam surface — because a demand channel where strangers contact
 * strangers about things they want to buy is exactly what fraud looks for.
 */
describe('RequirementsService', () => {
  const requirement = {
    id: 'req-1',
    ownerId: 'buyer-1',
    type: ListingType.BUYER_REQUIREMENT,
    status: ListingStatus.PUBLISHED,
    title: 'Need a medium rat cage today',
    cityId: 'city-1',
    categoryId: 'cat-1',
    subcategoryId: null,
  };

  function build({
    listing = requirement as unknown,
    detail = { fulfilledAt: null } as { fulfilledAt: Date | null } | null,
    existingResponse = null as { id: string } | null,
    sellers = [{ ownerId: 'seller-1' }, { ownerId: 'seller-2' }],
  } = {}) {
    const prisma = {
      listing: {
        findFirst: jest.fn().mockResolvedValue(listing),
        findMany: jest.fn().mockResolvedValue(sellers),
      },
      buyerRequirementDetail: {
        findUnique: jest.fn().mockResolvedValue(detail),
        update: jest.fn().mockResolvedValue({}),
      },
      requirementResponse: {
        findUnique: jest.fn().mockResolvedValue(existingResponse),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: { data: object }) => ({
          ...data,
          createdAt: new Date(0),
        })),
        update: jest.fn().mockImplementation(({ data }: { data: object }) => ({
          id: 'resp-1',
          listingId: 'req-1',
          responderId: 'seller-1',
          businessId: null,
          offeredListingId: null,
          conversationId: null,
          createdAt: new Date(0),
          ...data,
        })),
      },
      business: { findFirst: jest.fn().mockResolvedValue(null) },
      businessStaff: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    // Assigned after the object exists: referencing `prisma` inside its own initialiser
    // makes its type circular. The stub runs the callback against the same mocks, which is
    // what these cases need — they assert which writes were attempted, not isolation.
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    const conversations = {
      start: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      startRequirementThread: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    };
    const notifications = {
      create: jest.fn().mockResolvedValue(undefined),
      createOnce: jest.fn().mockResolvedValue(true),
    };

    return {
      service: new RequirementsService(
        prisma as never,
        conversations as never,
        notifications as never,
      ),
      prisma,
      conversations,
      notifications,
    };
  }

  const answer = { kind: RequirementResponseKind.AVAILABLE, offeredPrice: 1400 };

  describe('answering', () => {
    it('records a structured answer and tells the buyer', async () => {
      const { service, notifications } = build();

      const response = await service.respond('seller-1', 'req-1', answer as never);

      expect(response.kind).toBe(RequirementResponseKind.AVAILABLE);
      expect(response.offeredPrice).toBe(1400);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'buyer-1', type: NotificationType.REQUIREMENT_RESPONSE }),
      );
    });

    it('counts the answer in the same transaction that creates it', async () => {
      const { service, prisma } = build();

      await service.respond('seller-1', 'req-1', answer as never);

      // Counted separately, a failure between the two leaves a requirement claiming replies
      // it does not have — and the buyer opens it to find nothing.
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.buyerRequirementDetail.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { responseCount: { increment: 1 } } }),
      );
    });

    it('updates an existing answer instead of adding a second', async () => {
      const { service, prisma, notifications } = build({ existingResponse: { id: 'resp-1' } });

      await service.respond('seller-1', 'req-1', answer as never);

      // A seller whose price changed is not spamming. The count must not move, and the buyer
      // must not be told twice about the same seller.
      expect(prisma.requirementResponse.update).toHaveBeenCalled();
      expect(prisma.requirementResponse.create).not.toHaveBeenCalled();
      expect(prisma.buyerRequirementDetail.update).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('refuses to let a buyer answer their own requirement', async () => {
      const { service } = build();

      await expect(service.respond('buyer-1', 'req-1', answer as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses once the buyer has closed it', async () => {
      const { service } = build({ detail: { fulfilledAt: new Date() } });

      await expect(service.respond('seller-1', 'req-1', answer as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a requirement that is not live', async () => {
      const { service } = build({
        listing: { ...requirement, status: ListingStatus.PAUSED },
      });

      await expect(service.respond('seller-1', 'req-1', answer as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to offer a listing that is not yours', async () => {
      const { service, prisma } = build();
      prisma.listing.findFirst
        .mockResolvedValueOnce(requirement) // the requirement
        .mockResolvedValueOnce(null); // the offered listing, not owned by this seller

      // Otherwise a response could advertise a stranger's goods to a buyer who never asked.
      await expect(
        service.respond('seller-1', 'req-1', { ...answer, offeredListingId: 'other' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to answer as a business you do not work for', async () => {
      const { service, prisma } = build();
      prisma.business.findFirst.mockResolvedValue({ ownerId: 'someone-else' });

      await expect(
        service.respond('seller-1', 'req-1', { ...answer, businessId: 'biz-1' } as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reading answers', () => {
    it('shows the buyer every answer', async () => {
      const { service, prisma } = build();

      await service.listResponses('req-1', 'buyer-1');

      expect(prisma.requirementResponse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { listingId: 'req-1', withdrawnAt: null } }),
      );
    });

    it('shows a seller only their own', async () => {
      const { service, prisma } = build();

      await service.listResponses('req-1', 'seller-1');

      // Showing sellers the competition would turn a buyer's requirement into price
      // discovery for sellers, which is not what the buyer posted it for.
      expect(prisma.requirementResponse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ responderId: 'seller-1' }),
        }),
      );
    });
  });

  describe('opening a conversation', () => {
    it('goes through the ordinary conversation path', async () => {
      const { service, prisma, conversations } = build();
      prisma.requirementResponse.findFirst.mockResolvedValue({
        id: 'resp-1',
        listingId: 'req-1',
        responderId: 'seller-1',
        businessId: null,
        offeredListingId: null,
        withdrawnAt: null,
      });

      await service.openConversation('buyer-1', 'resp-1', 'Is it still available?');

      // The thread is about the requirement, between the buyer and the seller who answered —
      // not about a listing the seller may never have offered. It still goes through the
      // conversation service, so blocking and rate limiting apply exactly as elsewhere.
      expect(conversations.startRequirementThread).toHaveBeenCalledWith(
        'buyer-1',
        'seller-1',
        'req-1',
        'Is it still available?',
      );
    });

    it('lets only the buyer open it', async () => {
      const { service, prisma } = build();
      prisma.requirementResponse.findFirst.mockResolvedValue({
        id: 'resp-1',
        listingId: 'req-1',
        businessId: null,
        offeredListingId: null,
        withdrawnAt: null,
      });

      await expect(service.openConversation('seller-2', 'resp-1', 'hello')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('closing', () => {
    it('records fulfilment rather than deleting the requirement', async () => {
      const { service, prisma } = build();

      await service.markFulfilled('buyer-1', 'req-1', true);

      // A requirement nobody could answer names demand this area could not meet, which is
      // the most valuable thing the platform learns.
      expect(prisma.buyerRequirementDetail.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { fulfilledAt: expect.any(Date) } }),
      );
    });

    it('lets only the buyer close it', async () => {
      const { service } = build();

      await expect(service.markFulfilled('seller-1', 'req-1', true)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('treats a missing requirement as missing', async () => {
      const { service, prisma } = build();
      prisma.listing.findFirst.mockResolvedValue(null);

      await expect(service.markFulfilled('buyer-1', 'req-1', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('telling sellers', () => {
    it('announces a requirement to sellers in that category nearby', async () => {
      const { service, notifications } = build();

      await expect(service.notifyMatchingSellers(requirement as never)).resolves.toBe(2);
      expect(notifications.createOnce).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.REQUIREMENT_MATCH,
          data: expect.objectContaining({ entityId: 'req-1' }),
        }),
      );
    });

    it('never tells the buyer about their own requirement', async () => {
      const { service, prisma } = build();

      await service.notifyMatchingSellers(requirement as never);

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: { not: 'buyer-1' } }),
        }),
      );
    });

    it('tells a seller once however many listings they have', async () => {
      const { service, prisma } = build();

      await service.notifyMatchingSellers(requirement as never);

      // `distinct` on the query and `createOnce` on the notification: a seller with four
      // listings in the category hears about it once, not four times.
      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ distinct: ['ownerId'] }),
      );
    });

    it('caps how many sellers are told', async () => {
      const { service, prisma } = build();

      await service.notifyMatchingSellers(requirement as never);

      // Telling every seller in a city is how people turn notifications off entirely, and
      // they take their listing and chat alerts with them when they go.
      const args = prisma.listing.findMany.mock.calls[0][0] as { take: number };
      expect(args.take).toBeLessThanOrEqual(25);
    });

    it('ignores anything that is not a requirement', async () => {
      const { service, notifications } = build();

      await service.notifyMatchingSellers({
        ...requirement,
        type: ListingType.PRODUCT,
      } as never);

      expect(notifications.createOnce).not.toHaveBeenCalled();
    });

    it('does not fail the posting when matching goes wrong', async () => {
      const { service, prisma } = build();
      prisma.listing.findMany.mockRejectedValue(new Error('database down'));

      // A requirement that exists without alerts is a far smaller problem than one that
      // could not be posted at all.
      await expect(service.notifyMatchingSellers(requirement as never)).resolves.toBe(0);
    });
  });
});
