import { BadRequestException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PasswordResetService } from '../src/auth/password-reset.service';

/**
 * Resetting a forgotten password.
 *
 * Before this, a forgotten password meant a lost account — there was no reset anywhere in the
 * platform. The cases below are about the two properties that make it safe to have: it must
 * not reveal which addresses have accounts, and the stored token must be useless to anybody
 * who reads the database.
 */
describe('PasswordResetService', () => {
  const account = {
    id: 'user-1',
    email: 'ravi@example.com',
    status: UserStatus.ACTIVE as UserStatus,
    deletedAt: null as Date | null,
  };

  function build({
    user = account as typeof account | null,
    recentRequests = 0,
    token = null as { id: string; userId: string; usedAt: Date | null; expiresAt: Date; user: typeof account } | null,
  } = {}) {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({}),
      },
      passwordResetToken: {
        count: jest.fn().mockResolvedValue(recentRequests),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(token),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    const email = { send: jest.fn().mockResolvedValue(true) };
    const tokens = { revokeAllForUser: jest.fn().mockResolvedValue(2) };
    const config = { get: jest.fn().mockReturnValue('https://locz.in') };

    return {
      service: new PasswordResetService(
        prisma as never,
        email as never,
        tokens as never,
        config as never,
      ),
      prisma,
      email,
      tokens,
    };
  }

  describe('requesting', () => {
    it('emails a link to a real account', async () => {
      const { service, email } = build();

      await service.request('ravi@example.com');

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'ravi@example.com', tag: 'password-reset' }),
      );
    });

    it('stores only a hash of the token, never the token', async () => {
      const { service, prisma, email } = build();

      await service.request('ravi@example.com');

      const stored = prisma.passwordResetToken.create.mock.calls[0][0].data as {
        tokenHash: string;
      };
      const sent = (email.send.mock.calls[0][0] as { text: string }).text;
      const emailed = /token=([\w-]+)/.exec(sent)?.[1] ?? '';

      // A reset table in a leaked backup must not be a list of working keys.
      expect(emailed.length).toBeGreaterThan(20);
      expect(stored.tokenHash).not.toContain(emailed);
      expect(stored.tokenHash).toBe(createHash('sha256').update(emailed).digest('hex'));
    });

    it('says nothing different for an address with no account', async () => {
      const { service, email } = build({ user: null });

      // No throw, no distinguishable outcome. A form that answered "no such user" would be
      // an account enumeration tool, and here that means learning who trades on the platform.
      await expect(service.request('nobody@example.com')).resolves.toBeUndefined();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('says nothing different for a suspended account', async () => {
      const { service, email } = build({ user: { ...account, status: UserStatus.SUSPENDED } });

      await expect(service.request('ravi@example.com')).resolves.toBeUndefined();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('stops after a few requests, and stays silent about it', async () => {
      const { service, email } = build({ recentRequests: 3 });

      // A rate-limit message would confirm the account exists.
      await expect(service.request('ravi@example.com')).resolves.toBeUndefined();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('points the link at the site, not the API host', async () => {
      const { service, email } = build();

      await service.request('ravi@example.com');

      // The API answers on api.locz.in while the person reading the email needs locz.in.
      const sent = (email.send.mock.calls[0][0] as { text: string }).text;
      expect(sent).toContain('https://locz.in/reset-password?token=');
    });
  });

  describe('completing', () => {
    const usable = {
      id: 'token-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: account,
    };

    it('sets the password and signs every session out', async () => {
      const { service, prisma, tokens } = build({ token: usable });

      await service.complete('a-token', 'a new strong password');

      expect(prisma.user.update).toHaveBeenCalled();
      // If the password was changed because somebody else had it, leaving their session
      // alive would make the reset pointless.
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('user-1', expect.any(String));
    });

    it('kills every other outstanding link for that account', async () => {
      const { service, prisma } = build({ token: usable });

      await service.complete('a-token', 'a new strong password');

      // Somebody who requested three resets should not leave two working keys behind.
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', usedAt: null } }),
      );
    });

    it('refuses a token that was already used', async () => {
      const { service } = build({ token: { ...usable, usedAt: new Date() } });

      await expect(service.complete('a-token', 'a new strong password')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses an expired token', async () => {
      const { service } = build({ token: { ...usable, expiresAt: new Date(Date.now() - 1) } });

      await expect(service.complete('a-token', 'a new strong password')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('gives the same message however it failed', async () => {
      const unknown = build({ token: null });
      const used = build({ token: { ...usable, usedAt: new Date() } });

      const first = await unknown.service
        .complete('x', 'a new strong password')
        .catch((error: Error) => error.message);
      const second = await used.service
        .complete('x', 'a new strong password')
        .catch((error: Error) => error.message);

      // Distinguishing "expired" from "already used" from "never existed" would let somebody
      // probe which links were issued, and helps nobody who just needs a new one.
      expect(first).toBe(second);
    });

    it('does not change the password when the token is bad', async () => {
      const { service, prisma } = build({ token: null });

      await service.complete('x', 'a new strong password').catch(() => undefined);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('checking a link', () => {
    it('answers yes or no and never why', async () => {
      const good = build({
        token: {
          id: 't',
          userId: 'user-1',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: account,
        },
      });
      const expired = build({
        token: {
          id: 't',
          userId: 'user-1',
          usedAt: null,
          expiresAt: new Date(Date.now() - 1),
          user: account,
        },
      });

      await expect(good.service.isUsable('x')).resolves.toBe(true);
      await expect(expired.service.isUsable('x')).resolves.toBe(false);
    });
  });
});
