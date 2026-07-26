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
      },
    };
    const tokens = { revokeAllForUser: jest.fn().mockResolvedValue(3) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };

    const service = new ModerationService(
      {} as never,
      prisma as never,
      audit as never,
      {} as never,
      tokens as never,
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
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      target.id,
      expect.stringContaining('suspended'),
    );
    expect(result).toEqual({ suspended: true, sessionsRevoked: 3 });
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
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ModerationService(
      {} as never,
      prisma as never,
      audit as never,
      {} as never,
      { revokeAllForUser: jest.fn() } as never,
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
