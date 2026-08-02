import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BusinessClaimStatus, ClaimReviewStatus } from '@prisma/client';
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
      business: {
        findFirst: jest.fn().mockResolvedValue(found),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
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

      const result = await service.create('user-1', 'biz-1', {
        evidence: 'I have run this shop since 2015.',
      });

      // Approving hands over the listings, the enquiries and the shop's identity in search,
      // and the only evidence at this point is text typed into a form.
      expect(result.status).toBe(ClaimReviewStatus.PENDING);
      expect(prisma.business.update).not.toHaveBeenCalled();
    });

    it('marks the business as contested so a buyer and a second claimant can both see it', async () => {
      const { service, prisma } = build();

      await service.create('user-1', 'biz-1', { evidence: 'I have run this shop since 2015.' });

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
      await expect(
        service.create('user-1', 'biz-1', { evidence: 'I have run this shop since 2015.' }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a second claim from the same person', async () => {
      const { service } = build({ existingClaim: { id: 'claim-0' } });

      await expect(
        service.create('user-1', 'biz-1', { evidence: 'I have run this shop since 2015.' }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a business that does not exist', async () => {
      const { service } = build({ found: null });

      await expect(
        service.create('user-1', 'biz-1', { evidence: 'I have run this shop since 2015.' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('approving', () => {
    it('hands the business over and records the owner', async () => {
      const { service, prisma } = build({ claim: pending });

      await service.approve('admin-1', 'claim-1');

      expect(prisma.business.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { ownerId: 'user-1', claimStatus: BusinessClaimStatus.CLAIMED },
        }),
      );
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
      expect(prisma.business.update).toHaveBeenCalled();
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
});
