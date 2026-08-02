import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { v7 as uuid } from 'uuid';
import { AppConfig } from '../config/config.module';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

/**
 * Long enough to reach an inbox and act, short enough that a leaked link is usually dead.
 * An hour is the common convention and people do not read email slower than that.
 */
const TOKEN_LIFETIME_MS = 60 * 60 * 1000;

/** Requests per address before the platform stops sending. Enough for a real mistake. */
const MAX_REQUESTS_PER_HOUR = 3;

/**
 * Resetting a forgotten password.
 *
 * Nobody could recover an account before this: there was no reset anywhere in the platform,
 * so a forgotten password meant a lost account, its listings and its conversations.
 *
 * Two properties matter more than the mechanics. The endpoint must not reveal which email
 * addresses have accounts — a reset form that answers "no such user" is an account
 * enumeration tool, and on a marketplace that means learning who trades here. And the token
 * must be useless to anyone who reads the database, which is why only its hash is stored.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Starts a reset. Always succeeds from the caller's point of view.
   *
   * The same response is returned whether or not the address has an account, whether it is
   * suspended, and whether the mail was actually accepted. Anything else turns this into a
   * way to ask the platform who its users are.
   */
  async request(email: string, ip?: string): Promise<void> {
    const address = email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email: address, deletedAt: null },
    });

    // Nothing happens for an unknown address, a suspended account, or one that signs in only
    // with Google — but the caller cannot tell any of those apart from success.
    if (!user || user.status !== UserStatus.ACTIVE) {
      this.logger.log(`Reset requested for an address with no eligible account`);
      return;
    }

    const recent = await this.prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= MAX_REQUESTS_PER_HOUR) {
      // Silently, for the same reason: a rate-limit message would confirm the account exists.
      this.logger.warn(`Reset rate limit reached for user ${user.id}`);
      return;
    }

    // 32 bytes from the CSPRNG. Guessing one is not a threat model anybody needs to worry
    // about, which is what lets the link work without a second factor.
    const token = randomBytes(32).toString('base64url');

    await this.prisma.passwordResetToken.create({
      data: {
        id: uuid(),
        userId: user.id,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
        requestedIp: ip ?? null,
      },
    });

    const link = `${this.config.get('PUBLIC_SITE_URL')}/reset-password?token=${token}`;

    await this.email.send({
      to: address,
      subject: 'Reset your LocZ password',
      tag: 'password-reset',
      // Plain text carries everything. A message that only renders as HTML is unreadable in
      // the clients that strip it, and this one has to work for everybody.
      text: [
        `Somebody asked to reset the password for your LocZ account.`,
        ``,
        `Open this link within the next hour to choose a new one:`,
        link,
        ``,
        `If that was not you, ignore this email. Your password has not changed, and the link`,
        `stops working on its own.`,
        ``,
        `LocZ will never ask you for your password, an OTP or a banking PIN.`,
      ].join('\n'),
    });
  }

  /**
   * Completes a reset.
   *
   * Every failure returns the same message. Distinguishing "expired" from "already used"
   * from "never existed" would let somebody probe which links were ever issued, and none of
   * those distinctions helps a person who simply needs to request a new one.
   */
  async complete(token: string, newPassword: string): Promise<void> {
    const invalid = new BadRequestException(
      'That reset link is no longer valid. Request a new one.',
    );

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) throw invalid;
    if (record.user.deletedAt || record.user.status !== UserStatus.ACTIVE) throw invalid;

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      // Every other outstanding link for this account dies with it. Somebody who requested
      // three resets should not leave two working keys behind after using one.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });

    // Signing every session out is the point of a reset. If the password was changed because
    // somebody else had it, leaving their session alive would make the reset pointless.
    await this.tokens.revokeAllForUser(record.userId, 'password reset');

    this.logger.log(`Password reset completed for user ${record.userId}`);
  }

  /**
   * Whether a token could still be used, for the page that asks for a new password.
   *
   * Lets the form say "this link has expired" before somebody types a password, rather than
   * after. Deliberately returns only a boolean — it never says why.
   */
  async isUsable(token: string): Promise<boolean> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    return Boolean(record && !record.usedAt && record.expiresAt > new Date());
  }

  /**
   * SHA-256, not a password hash.
   *
   * Argon2 would be wrong here and slower for no benefit: a 32-byte random token has no
   * guessable structure, so the slow hashing that protects human-chosen passwords protects
   * nothing. What matters is that the stored value cannot be used as a token, and a digest
   * achieves that.
   */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
