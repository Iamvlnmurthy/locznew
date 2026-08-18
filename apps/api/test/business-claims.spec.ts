import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  BusinessClaimStatus,
  BusinessScale,
  ClaimReviewStatus,
  OfferingType,
} from '@prisma/client';
import { BusinessClaimsService } from '../src/businesses/business-claims.service';

/**
 * Taking over an imported directory record.
 *
 * The four-million-business directory is worth nothing to a shop until that shop can control
 * its own record. But the records are public, so anybody can see exactly which businesses
 * exist and have no owner — which makes "who asks first" an attack rather than a rule. Most
 * of what follows is about the two places a claim could hand a shop to the wrong person: an
 * automatic grant, and a business being handed to two claimants.
 */
describe('BusinessClaimsService', () => {
  const business = {
    id: 'biz-1',
    name: 'Sri Lakshmi Kirana',
    ownerId: null as string | null,
    claimStatus: BusinessClaimStatus.UNCLAIMED,
  };

  function build({
    found = business as typeof business | null,
    existingClaim = null as { id: string } | null,
    claim = null as unknown,
    pendingCount = 0,
  } = {}) {
    const prisma = {
      // Unverified by default, so no signal counts and the claim goes to the queue — the
      // behaviour every case below except the auto-approval ones expects.
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          phoneE164: '+919000000001',
          phoneVerifiedAt: null,
          email: 'someone@example.com',
          emailVerifiedAt: null,
        }),
      },
      business: {
        findFirst: jest.fn().mockResolvedValue(found),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      listing: { count: jest.fn().mockResolvedValue(4) },
      businessClaim: {
        findFirst: jest.fn().mockResolvedValue(existingClaim),
        findUnique: jest.fn().mockResolvedValue(claim),
        create: jest.fn().mockResolvedValue({ id: 'claim-1', status: ClaimReviewStatus.PENDING }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(pendingCount),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    const notifications = { create: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    return {
      service: new BusinessClaimsService(prisma as never, notifications as never, audit as never),
      prisma,
      notifications,
      audit,
    };
  }

  /** Every claim now states what the business actually is; the reviewer approves that too. */
  const claimInput = (extra: Record<string, unknown> = {}) => ({
    evidence: 'I have run this shop since 2015.',
    scale: BusinessScale.INDIVIDUAL_SHOP,
    offering: OfferingType.PRODUCTS,
    ...extra,
  });

  const pending = {
    id: 'claim-1',
    businessId: 'biz-1',
    claimantId: 'user-1',
    status: ClaimReviewStatus.PENDING,
    business: { name: 'Sri Lakshmi Kirana', ownerId: null as string | null },
  };

  describe('filing a claim', () => {
    it('records it as pending rather than granting it', async () => {
      const { service, prisma } = build();

      const result = await service.create('user-1', 'biz-1', claimInput());

      // Approving hands over the listings, the enquiries and the shop's identity in search,
      // and the only evidence at this point is text typed into a form.
      expect(result.status).toBe(ClaimReviewStatus.PENDING);
      expect(prisma.business.update).not.toHaveBeenCalled();
    });

    it('marks the business as contested so a buyer and a second claimant can both see it', async () => {
      const { service, prisma } = build();

      await service.create('user-1', 'biz-1', claimInput());

      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'biz-1', claimStatus: BusinessClaimStatus.UNCLAIMED },
          data: { claimStatus: BusinessClaimStatus.CLAIM_PENDING },
        }),
      );
    });

    it('refuses a business that already has an owner', async () => {
      const { service } = build({ found: { ...business, ownerId: 'someone-else' } });

      // A business with an owner is a dispute with evidence on both sides, not something
      // this flow can settle. Reassigning here would be a takeover mechanism.
      await expect(service.create('user-1', 'biz-1', claimInput())).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses a second claim from the same person', async () => {
      const { service } = build({ existingClaim: { id: 'claim-0' } });

      await expect(service.create('user-1', 'biz-1', claimInput())).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses a business that does not exist', async () => {
      const { service } = build({ found: null });

      await expect(service.create('user-1', 'biz-1', claimInput())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approving', () => {
    it('hands the business over and records the owner', async () => {
      const { service, prisma } = build({ claim: pending });

      await service.approve('admin-1', 'claim-1');

      // Guarded on the business still having no owner, so two reviewers deciding at once
      // cannot hand the same shop to two people — the loser gets a conflict, not a silent
      // overwrite.
      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'biz-1', ownerId: null },
          data: expect.objectContaining({
            ownerId: 'user-1',
            claimStatus: BusinessClaimStatus.CLAIMED,
          }),
        }),
      );
    });

    it('refuses when the business was claimed between the queue and the decision', async () => {
      const { service, prisma } = build({ claim: pending });
      // Nothing was updated: somebody else already owns it.
      prisma.business.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('admin-1', 'claim-1')).rejects.toThrow('already has an owner');
    });

    it('applies what the claimant said the business is', async () => {
      const { service, prisma } = build({
        claim: {
          ...pending,
          proposedScale: BusinessScale.HOME_BUSINESS,
          offeringProposed: OfferingType.SERVICES,
          proposedCategoryId: 'cat-9',
        },
      });

      await service.approve('admin-1', 'claim-1');

      // An imported record's category was inferred from map tags and is often wrong. The
      // owner is the first person able to correct it — but only once a reviewer agrees the
      // business is theirs, or the claim form becomes an edit form for unowned records.
      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scale: BusinessScale.HOME_BUSINESS,
            offering: OfferingType.SERVICES,
            categoryId: 'cat-9',
          }),
        }),
      );
    });

    it('leaves the category alone when the claimant proposed none', async () => {
      const { service, prisma } = build({ claim: { ...pending, proposedCategoryId: null } });

      await service.approve('admin-1', 'claim-1');

      // Overwriting an inferred category with nothing is not an improvement on the guess.
      const data = prisma.business.updateMany.mock.calls[0][0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty('categoryId');
    });

    it('closes every competing claim in the same breath', async () => {
      const { service, prisma } = build({ claim: pending });

      await service.approve('admin-1', 'claim-1');

      // Leaving them pending would offer a reviewer the chance to hand the same shop to two
      // people, and leaves the losing claimants waiting on an answer that cannot come.
      expect(prisma.businessClaim.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: 'biz-1',
            status: ClaimReviewStatus.PENDING,
            id: { not: 'claim-1' },
          }),
        }),
      );
    });

    it('does the handover in one transaction', async () => {
      const { service, prisma } = build({ claim: pending });

      await service.approve('admin-1', 'claim-1');

      // A half-applied approval is the worst outcome available: an owner recorded on a
      // business that still reads as unclaimed, or an approval that transferred nothing.
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('refuses a claim that was already decided', async () => {
      const { service } = build({ claim: { ...pending, status: ClaimReviewStatus.REJECTED } });

      await expect(service.approve('admin-1', 'claim-1')).rejects.toThrow(ConflictException);
    });

    it('refuses when somebody took ownership while the claim sat in the queue', async () => {
      const { service } = build({
        claim: { ...pending, business: { name: 'x', ownerId: 'someone-else' } },
      });

      await expect(service.approve('admin-1', 'claim-1')).rejects.toThrow(ConflictException);
    });

    it('still approves when the claimant cannot be notified', async () => {
      const { service, prisma, notifications } = build({ claim: pending });
      notifications.create.mockRejectedValue(new Error('notifications down'));

      await expect(service.approve('admin-1', 'claim-1')).resolves.toBeUndefined();

      // The decision is the record. Failing it because a message did not send would leave the
      // shop unowned over something that can be retried.
      expect(prisma.business.updateMany).toHaveBeenCalled();
    });
  });

  describe('rejecting', () => {
    it('demands a reason the claimant can act on', async () => {
      const { service } = build({ claim: pending });

      // The person on the other end is usually a shopkeeper who does own the shop and simply
      // did not say anything that showed it.
      await expect(service.reject('admin-1', 'claim-1', '  no ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sends the reason to the claimant', async () => {
      const { service, notifications } = build({ claim: pending });

      await service.reject('admin-1', 'claim-1', 'The phone number does not match.');

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('phone number does not match') }),
      );
    });

    it('puts the business back to unclaimed when no claim is left', async () => {
      const { service, prisma } = build({ claim: pending, pendingCount: 0 });

      await service.reject('admin-1', 'claim-1', 'The phone number does not match.');

      // Otherwise the record reads as contested for ever, which tells a buyer somebody is
      // standing behind it when nobody is, and discourages the real owner from claiming it.
      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { claimStatus: BusinessClaimStatus.UNCLAIMED },
        }),
      );
    });

    it('leaves it contested while another claim is still waiting', async () => {
      const { service, prisma } = build({ claim: pending, pendingCount: 1 });

      await service.reject('admin-1', 'claim-1', 'The phone number does not match.');

      expect(prisma.business.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('withdrawing', () => {
    it('refuses to touch a claim that is not the caller"s own', async () => {
      const { service, prisma } = build();
      prisma.businessClaim.findFirst.mockResolvedValue(null);

      await expect(service.withdraw('user-2', 'claim-1')).rejects.toThrow(NotFoundException);
    });

    it('releases the business when nothing else is pending', async () => {
      const { service, prisma } = build({ pendingCount: 0 });
      prisma.businessClaim.findFirst.mockResolvedValue({ id: 'claim-1', businessId: 'biz-1' });

      await service.withdraw('user-1', 'claim-1');

      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { claimStatus: BusinessClaimStatus.UNCLAIMED } }),
      );
    });
  });

  /**
   * Suggesting a record somebody is about to duplicate.
   *
   * A shopkeeper whose shop is already in the directory has no way to know. Left alone they
   * create a second record, and the platform holds two entries for one shop: the owner on a
   * new empty page, and their actual shop unclaimed with the search traffic.
   */
  describe('suggesting an existing record', () => {
    const record = {
      id: 'biz-1',
      slug: 'sri-lakshmi-kirana',
      name: 'Sri Lakshmi Kirana Store',
      primaryPhone: '+919876543210',
      whatsappNumber: null,
      latitude: 17.4485,
      longitude: 78.3908,
    };

    function matcher(candidates: unknown[]) {
      const { service, prisma } = build();
      prisma.business.findMany.mockResolvedValue(candidates);
      return service;
    }

    it('suggests a record matching on name and phone', async () => {
      const service = matcher([record]);

      const matches = await service.findPossibleMatches({
        name: 'Sri Lakshmi Kirana',
        phone: '+919876543210',
      });

      expect(matches).toHaveLength(1);
      expect(matches[0]!.matchedOn).toEqual(expect.arrayContaining(['NAME', 'PHONE']));
    });

    it('ignores a record that matches on one thing only', async () => {
      const service = matcher([{ ...record, primaryPhone: null }]);

      // One coincidence is not a suggestion. A shop in the same city whose name starts with
      // the same word would otherwise fill the list with noise.
      await expect(service.findPossibleMatches({ name: 'Sri Lakshmi Kirana' })).resolves.toEqual(
        [],
      );
    });

    it('matches a name written with different punctuation', async () => {
      const service = matcher([{ ...record, name: 'Sri Lakshmi Kirana & Store' }]);

      const matches = await service.findPossibleMatches({
        name: 'sri lakshmi kirana',
        phone: '+919876543210',
      });

      expect(matches).toHaveLength(1);
    });

    it('reports how far away it is', async () => {
      const service = matcher([record]);

      const matches = await service.findPossibleMatches({
        name: 'Sri Lakshmi Kirana',
        phone: '+919876543210',
        latitude: 17.4485,
        longitude: 78.39108,
      });

      expect(matches[0]!.distanceM).toBeLessThan(50);
      expect(matches[0]!.matchedOn).toContain('LOCATION');
    });

    it('only ever looks at records nobody owns', async () => {
      const { service, prisma } = build();
      prisma.business.findMany.mockResolvedValue([]);

      await service.findPossibleMatches({ name: 'Sri Lakshmi Kirana' });

      // A business with an owner is not something to suggest taking over.
      expect(prisma.business.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ ownerId: null }) }),
      );
    });
  });

  /**
   * Granting without a person reading it.
   *
   * Two independent verified signals beat a convincing paragraph, and a queue that makes every
   * real shopkeeper wait days is its own failure. What must not happen is the shortcut also
   * shortening the guards around handover.
   */
  describe('automatic approval', () => {
    const verifiedClaimant = {
      phoneE164: '+919876543210',
      phoneVerifiedAt: new Date(),
      email: 'ravi@example.com',
      emailVerifiedAt: new Date(),
    };
    const shop = {
      ...business,
      primaryPhone: '+919876543210',
      whatsappNumber: null,
      email: 'ravi@example.com',
      latitude: 17.4485,
      longitude: 78.3908,
    };

    function build2() {
      const made = build({ found: shop as never });
      made.prisma.user.findUniqueOrThrow.mockResolvedValue(verifiedClaimant);
      return made;
    }

    it('hands the business over when phone and email both match', async () => {
      const { service, prisma } = build2();

      const result = await service.create('user-1', 'biz-1', claimInput());

      expect(result.status).toBe(ClaimReviewStatus.APPROVED);
      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'biz-1', ownerId: null },
          data: expect.objectContaining({ ownerId: 'user-1' }),
        }),
      );
    });

    it('guards the handover on the business still being unowned', async () => {
      const { service, prisma } = build2();
      prisma.business.updateMany.mockResolvedValue({ count: 0 });

      // Two claimants can both satisfy two signals for the same shop. The loser must not
      // silently overwrite the winner, so the write is conditional and its count is checked.
      await expect(service.create('user-1', 'biz-1', claimInput())).rejects.toThrow(
        ConflictException,
      );
    });

    it('records which checks matched', async () => {
      const { service, prisma } = build2();

      await service.create('user-1', 'biz-1', claimInput());

      // When a handover later turns out to be wrong, this is the only record of why the
      // platform believed it.
      const data = prisma.businessClaim.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.matchedSignals).toEqual(expect.arrayContaining(['PHONE', 'EMAIL']));
      expect(data.autoApproved).toBe(true);
    });

    it('queues instead when only one check matches', async () => {
      const { service, prisma } = build2();
      prisma.business.findFirst.mockResolvedValue({ ...shop, email: null });

      const result = await service.create('user-1', 'biz-1', claimInput());

      expect(result.status).toBe(ClaimReviewStatus.PENDING);
      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { claimStatus: BusinessClaimStatus.CLAIM_PENDING } }),
      );
    });

    it('queues when the identifiers match but were never verified', async () => {
      const { service, prisma } = build2();
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...verifiedClaimant,
        phoneVerifiedAt: null,
        emailVerifiedAt: null,
      });

      // Two unverified matches are one fact — the directory is public — counted twice.
      const result = await service.create('user-1', 'biz-1', claimInput());

      expect(result.status).toBe(ClaimReviewStatus.PENDING);
    });
  });

  describe('the claim pitch', () => {
    it("counts only enquiries raised from this shop's own page", async () => {
      const { service, prisma } = build();

      await expect(service.enquiryCount('biz-1')).resolves.toBe(4);

      // A number inflated with unrelated nearby demand would be a sales figure rather than a
      // fact, and the first shopkeeper who checked would stop believing the rest of it.
      expect(prisma.listing.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ promptedByBusinessId: 'biz-1' }),
        }),
      );
    });

    it('looks back over a bounded window', async () => {
      const { service, prisma } = build();

      await service.enquiryCount('biz-1', 7);

      // "Four people asked this week" is a reason to act. "Four people asked, ever" is not.
      const where = prisma.listing.count.mock.calls[0][0].where as { createdAt: { gte: Date } };
      const days = (Date.now() - where.createdAt.gte.getTime()) / (24 * 60 * 60 * 1000);
      expect(days).toBeCloseTo(7, 1);
    });
  });
});
