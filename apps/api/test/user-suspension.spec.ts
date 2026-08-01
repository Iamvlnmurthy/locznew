import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { ModerationService } from '../src/moderation/moderation.service';
import { makeUser } from './factories';

/**
 * Suspension is the only tool that stops a person rather than a listing, and it is worth
 * nothing if it takes effect later. A moderator suspends an account because of what
 * someone is doing right now; leaving their access token alive for another quarter of an
 * hour hands them exactly the window they need to keep doing it.
 */
describe('ModerationService.suspendUser', () => {
  const moderatorId = 'moderator-1';

  function build(user: ReturnType<typeof makeUser> | null) {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(user),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userSuspension: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // The writes are one transaction on purpose: a status without its record, or a
      // record without the status, is worse than neither.
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };
    const tokens = { revokeAllForUser: jest.fn().mockResolvedValue(3) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new ModerationService(
      {} as never,
      prisma as never,
      audit as never,
      {} as never,
      tokens as never,
      // Saved-search alert queue. Suspension never reaches it, but the constructor wants it.
      { add: jest.fn().mockResolvedValue({}) } as never,
      // Requirement matcher queue: sellers are told about new buyer requirements from here.
      { add: jest.fn().mockResolvedValue({}) } as never,
    );

    return { service, prisma, tokens, audit };
  }

  it('revokes every session as it suspends', async () => {
    const target = makeUser({ status: UserStatus.ACTIVE });
    const { service, prisma, tokens } = build(target);

    const result = await service.suspendUser(target.id, moderatorId, 'Repeated fake listings');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { status: UserStatus.SUSPENDED },
    });
    expect(prisma.userSuspension.create).toHaveBeenCalled();
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      target.id,
      expect.stringContaining('suspended'),
    );
    expect(result).toEqual({ suspended: true, sessionsRevoked: 3, endsAt: null });
  });

  it('records who did it and why, because the action has to be reviewable', async () => {
    const target = makeUser({ status: UserStatus.ACTIVE });
    const { service, audit } = build(target);

    await service.suspendUser(target.id, moderatorId, 'Harassing a seller in messages');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.suspend',
        entityId: target.id,
        actorId: moderatorId,
        changes: expect.objectContaining({ reason: 'Harassing a seller in messages' }),
      }),
    );
  });

  it('refuses to suspend the moderator doing the suspending', async () => {
    const target = makeUser({ id: moderatorId, status: UserStatus.ACTIVE });
    const { service, tokens } = build(target);

    await expect(
      service.suspendUser(moderatorId, moderatorId, 'a slip of the mouse'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('refuses to suspend an account that already is', async () => {
    const target = makeUser({ status: UserStatus.SUSPENDED });
    const { service, tokens } = build(target);

    await expect(
      service.suspendUser(target.id, moderatorId, 'Repeated fake listings'),
    ).rejects.toBeInstanceOf(ConflictException);
    // The important part: a second suspension must not silently revoke a fresh session the
    // person opened after being reinstated.
    expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('refuses an account that does not exist', async () => {
    const { service } = build(null);

    await expect(
      service.suspendUser('nobody', moderatorId, 'Repeated fake listings'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ModerationService.reinstateUser', () => {
  function build(user: ReturnType<typeof makeUser> | null) {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(user),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userSuspension: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ModerationService(
      {} as never,
      prisma as never,
      audit as never,
      {} as never,
      { revokeAllForUser: jest.fn() } as never,
      { add: jest.fn().mockResolvedValue({}) } as never,
      // Requirement matcher queue: sellers are told about new buyer requirements from here.
      { add: jest.fn().mockResolvedValue({}) } as never,
    );
    return { service, prisma, audit };
  }

  it('returns the account to active', async () => {
    const target = makeUser({ status: UserStatus.SUSPENDED });
    const { service, prisma } = build(target);

    await service.reinstateUser(target.id, 'moderator-1', 'Appeal upheld');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { status: UserStatus.ACTIVE },
    });
  });

  it('refuses an account that was never suspended', async () => {
    const { service } = build(makeUser({ status: UserStatus.ACTIVE }));

    await expect(
      service.reinstateUser('user-1', 'moderator-1', 'Appeal upheld'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('timed suspensions', () => {
  function build(rows: Array<{ id: string; userId: string }> = []) {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(makeUser({ status: UserStatus.ACTIVE })),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: rows.length }),
      },
      userSuspension: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: rows.length }),
        findMany: jest.fn().mockResolvedValue(rows),
      },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };
    const service = new ModerationService(
      {} as never,
      prisma as never,
      { record: jest.fn() } as never,
      {} as never,
      { revokeAllForUser: jest.fn().mockResolvedValue(1) } as never,
      { add: jest.fn().mockResolvedValue({}) } as never,
      // Requirement matcher queue: sellers are told about new buyer requirements from here.
      { add: jest.fn().mockResolvedValue({}) } as never,
    );
    return { service, prisma };
  }

  it('records an end date when given a duration', async () => {
    const { service, prisma } = build();

    const result = await service.suspendUser('user-1', 'moderator-1', 'Fake listings', 7);

    const created = prisma.userSuspension.create.mock.calls[0][0].data;
    expect(created.endsAt).toBeInstanceOf(Date);
    // Seven days out, within a minute of tolerance for the clock moving during the test.
    const days = (created.endsAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(result.endsAt).toEqual(created.endsAt);
  });

  it('leaves the end date open when no duration is given', async () => {
    const { service, prisma } = build();

    const result = await service.suspendUser('user-1', 'moderator-1', 'Fake listings');

    expect(prisma.userSuspension.create.mock.calls[0][0].data.endsAt).toBeNull();
    expect(result.endsAt).toBeNull();
  });

  it('lifts a suspension whose term has run out', async () => {
    const { service, prisma } = build([{ id: 'susp-1', userId: 'user-1' }]);

    const result = await service.liftExpiredSuspensions();

    expect(result).toEqual({ lifted: 1 });
    expect(prisma.userSuspension.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { liftedAt: expect.any(Date) } }),
    );
    // Only accounts suspended for this reason — a deactivated or deleted account must not
    // be quietly reactivated by a sweeper.
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: UserStatus.SUSPENDED }),
        data: { status: UserStatus.ACTIVE },
      }),
    );
  });

  it('does nothing when no suspension is due, rather than writing anyway', async () => {
    const { service, prisma } = build([]);

    expect(await service.liftExpiredSuspensions()).toEqual({ lifted: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
