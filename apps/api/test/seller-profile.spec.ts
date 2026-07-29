import { NotFoundException } from '@nestjs/common';
import { ListingStatus, UserStatus } from '@prisma/client';
import { SellerProfileService } from '../src/users/seller-profile.service';

/**
 * What LocZ says about a seller to a stranger who is about to meet them.
 *
 * The cases that matter are the ones where saying nothing is the honest answer. A response
 * rate over three conversations is a number about a coin toss, and a buyer reading "100%
 * replies" is being handed a claim the platform cannot stand behind.
 */
describe('SellerProfileService', () => {
  const minute = 60_000;
  const base = new Date('2026-07-01T10:00:00Z').getTime();

  /** `count` of enquiries, `answeredWithin` minutes each (null means never answered). */
  function conversationsWith(delays: Array<number | null>) {
    const conversations = delays.map((_, index) => ({ id: `conv-${index}` }));
    const messages = delays.flatMap((delay, index) => {
      const asked = {
        conversationId: `conv-${index}`,
        senderId: 'buyer',
        createdAt: new Date(base + index * minute),
      };
      if (delay === null) return [asked];
      return [
        asked,
        {
          conversationId: `conv-${index}`,
          senderId: 'seller-1',
          createdAt: new Date(base + index * minute + delay * minute),
        },
      ];
    });
    return { conversations, messages };
  }

  const activeUser: {
    id: string;
    displayName: string;
    bio: string | null;
    createdAt: Date;
    status: UserStatus;
  } = {
    id: 'seller-1',
    displayName: 'Ravi',
    bio: null,
    createdAt: new Date('2025-01-01'),
    status: UserStatus.ACTIVE,
  };

  function build({
    user = activeUser,
    delays = [] as Array<number | null>,
    published = 4,
    sold = 2,
  } = {}) {
    const { conversations, messages } = conversationsWith(delays);
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(user) },
      listing: {
        count: jest.fn().mockImplementation(({ where }: { where: { status: ListingStatus } }) =>
          Promise.resolve(where.status === ListingStatus.PUBLISHED ? published : sold),
        ),
      },
      conversation: { findMany: jest.fn().mockResolvedValue(conversations) },
      message: { findMany: jest.fn().mockResolvedValue(messages) },
    };
    return { service: new SellerProfileService(prisma as never), prisma };
  }

  it('reports what the platform observed', async () => {
    const { service } = build();

    await expect(service.get('seller-1')).resolves.toMatchObject({
      displayName: 'Ravi',
      publishedListings: 4,
      soldListings: 2,
      memberSince: new Date('2025-01-01'),
    });
  });

  it('never carries a phone number or an email', async () => {
    const { service } = build();

    const profile = await service.get('seller-1');

    // A number the owner published on one listing stays on that listing. It is not a fact
    // about the person that a profile page hands out.
    expect(profile).not.toHaveProperty('phone');
    expect(profile).not.toHaveProperty('email');
  });

  it('says nothing about responsiveness below a usable sample', async () => {
    const { service } = build({ delays: [5, 10, 3] });

    // 3 for 3 is 100% and means nothing. Absent reads as "we do not know yet", which is true.
    await expect(service.get('seller-1')).resolves.toMatchObject({
      responseRate: null,
      medianResponseMinutes: null,
    });
  });

  it('reports a rate once there is enough to say', async () => {
    const { service } = build({ delays: [5, 10, 20, null, 15, null] });

    await expect(service.get('seller-1')).resolves.toMatchObject({ responseRate: 67 });
  });

  it('uses the median rather than the mean for reply time', async () => {
    const { service } = build({ delays: [5, 6, 7, 8, 20_000] });

    // One reply a fortnight late would drag a mean into uselessness while the median still
    // describes the wait a buyer should expect.
    const profile = await service.get('seller-1');
    expect(profile.medianResponseMinutes).toBe(7);
  });

  it('does not count the seller talking first as answering anybody', async () => {
    const { service, prisma } = build({ delays: [5, 5, 5, 5, 5] });
    prisma.message.findMany.mockResolvedValue([
      // Seller reopens an old thread; nobody asked them anything.
      { conversationId: 'conv-x', senderId: 'seller-1', createdAt: new Date(base) },
    ]);

    await expect(service.get('seller-1')).resolves.toMatchObject({ responseRate: null });
  });

  it('counts only enquiries somebody else started', async () => {
    const { service, prisma } = build();

    await service.get('seller-1');

    // A seller cannot fail to answer a question nobody asked, and counting their own
    // outgoing enquiries would inflate the rate.
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ recipientId: 'seller-1' }) }),
    );
  });

  it('hides a suspended seller rather than labelling them', async () => {
    const { service } = build({ user: { ...activeUser, status: UserStatus.SUSPENDED } });

    // A marker would be a public accusation on a page they cannot answer.
    await expect(service.get('seller-1')).rejects.toThrow(NotFoundException);
  });

  it('treats a deleted seller as missing', async () => {
    const { service, prisma } = build();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.get('seller-1')).rejects.toThrow(NotFoundException);
  });
});
