import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { v7 as uuid } from 'uuid';
import { TooManyRequestsException } from '../../common/exceptions/too-many-requests.exception';
import { AppConfig } from '../../config/config.module';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { OTP_PROVIDER, OtpProvider } from './otp-provider.interface';

export type OtpPurpose = 'LOGIN' | 'PHONE_CHANGE' | 'DELETE_CONFIRM';

export interface OtpIssueContext {
  ip?: string;
  deviceKey?: string;
}

export interface OtpIssueResult {
  expiresInSeconds: number;
  /** Present only under the mock provider. */
  debugCode?: string;
}

/**
 * Issues and verifies one-time codes.
 *
 * Three independent brake pedals, because a free-posting platform's OTP endpoint is
 * both an SMS cost centre and an account-takeover surface:
 *   1. per-phone request rate limit (Redis fixed window)
 *   2. per-IP request rate limit (Redis fixed window)
 *   3. per-attempt verify counter with a database-backed lockout that survives restarts
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(OTP_PROVIDER) private readonly provider: OtpProvider,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private generateCode(): string {
    const length = this.config.get('OTP_LENGTH');
    const min = 10 ** (length - 1);
    const max = 10 ** length - 1;
    return String(randomInt(min, max + 1));
  }

  async issue(
    phoneE164: string,
    purpose: OtpPurpose,
    context: OtpIssueContext = {},
  ): Promise<OtpIssueResult> {
    await this.assertNotLockedOut(phoneE164);

    const window = this.config.get('OTP_REQUEST_WINDOW_SECONDS');
    const maxPerPhone = this.config.get('OTP_MAX_REQUESTS_PER_PHONE_PER_WINDOW');

    const phoneCount = await this.redis.incrementWithWindow(`otp:req:phone:${phoneE164}`, window);
    if (phoneCount > maxPerPhone) {
      const retryAfter = await this.redis.ttl(`otp:req:phone:${phoneE164}`);
      throw new TooManyRequestsException(
        `Too many verification codes requested. Try again in ${Math.max(retryAfter, 1)} seconds.`,
      );
    }

    if (context.ip) {
      // An IP-wide ceiling stops one host enumerating many phone numbers cheaply.
      const ipCount = await this.redis.incrementWithWindow(`otp:req:ip:${context.ip}`, 3600);
      if (ipCount > maxPerPhone * 10) {
        throw new TooManyRequestsException('Too many verification requests from this network.');
      }
    }

    const code = this.generateCode();
    const ttl = this.config.get('OTP_TTL_SECONDS');
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Any previous unconsumed code for this phone/purpose is invalidated, so only the
    // newest code can ever be redeemed.
    await this.prisma.otpAttempt.updateMany({
      where: { phoneE164, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpAttempt.create({
      data: {
        id: uuid(),
        phoneE164,
        codeHash: this.hash(code),
        purpose,
        maxAttempts: this.config.get('OTP_MAX_VERIFY_ATTEMPTS'),
        expiresAt,
        ip: context.ip,
        deviceKey: context.deviceKey,
      },
    });

    const result = await this.provider.send(phoneE164, code, purpose);
    this.logger.log(`OTP issued for ${this.maskPhone(phoneE164)} via ${this.provider.name}`);

    return { expiresInSeconds: ttl, debugCode: result.debugCode };
  }

  /**
   * Consumes the code. On success the attempt row is marked consumed and the failure
   * counters are cleared; on failure the attempt counter advances and, at the limit,
   * a lockout row is written.
   */
  async verify(phoneE164: string, code: string, purpose: OtpPurpose): Promise<void> {
    await this.assertNotLockedOut(phoneE164);

    const attempt = await this.prisma.otpAttempt.findFirst({
      where: { phoneE164, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) {
      throw new BadRequestException(
        'No verification code is pending for this number. Request a new one.',
      );
    }

    if (attempt.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This verification code has expired. Request a new one.');
    }

    if (attempt.attempts >= attempt.maxAttempts) {
      await this.lockOut(phoneE164);
      throw new ForbiddenException('Too many incorrect attempts. Try again later.');
    }

    if (attempt.codeHash !== this.hash(code)) {
      const updated = await this.prisma.otpAttempt.update({
        where: { id: attempt.id },
        data: { attempts: { increment: 1 } },
      });

      if (updated.attempts >= updated.maxAttempts) {
        await this.lockOut(phoneE164);
        throw new ForbiddenException('Too many incorrect attempts. Try again later.');
      }

      const remaining = updated.maxAttempts - updated.attempts;
      throw new BadRequestException(`Incorrect code. ${remaining} attempt(s) remaining.`);
    }

    await this.prisma.otpAttempt.update({
      where: { id: attempt.id },
      data: { consumedAt: new Date() },
    });

    await this.prisma.authLockout.deleteMany({ where: { scope: 'PHONE', identifier: phoneE164 } });
    await this.redis.del(`otp:req:phone:${phoneE164}`);
  }

  private async assertNotLockedOut(phoneE164: string): Promise<void> {
    const lockout = await this.prisma.authLockout.findUnique({
      where: { scope_identifier: { scope: 'PHONE', identifier: phoneE164 } },
    });

    if (!lockout) return;

    if (lockout.lockedUntil.getTime() > Date.now()) {
      const seconds = Math.ceil((lockout.lockedUntil.getTime() - Date.now()) / 1000);
      throw new ForbiddenException(
        `This number is temporarily locked. Try again in ${seconds} seconds.`,
      );
    }

    // Expired lockout — clear it so the next failure starts a fresh count.
    await this.prisma.authLockout.delete({ where: { id: lockout.id } });
  }

  private async lockOut(phoneE164: string): Promise<void> {
    const lockedUntil = new Date(Date.now() + this.config.get('OTP_LOCKOUT_SECONDS') * 1000);

    await this.prisma.authLockout.upsert({
      where: { scope_identifier: { scope: 'PHONE', identifier: phoneE164 } },
      update: { failedCount: { increment: 1 }, lockedUntil },
      create: { id: uuid(), scope: 'PHONE', identifier: phoneE164, failedCount: 1, lockedUntil },
    });

    this.logger.warn(
      `Phone ${this.maskPhone(phoneE164)} locked out until ${lockedUntil.toISOString()}`,
    );
  }

  private maskPhone(phoneE164: string): string {
    return phoneE164.length > 4 ? `${phoneE164.slice(0, 4)}****${phoneE164.slice(-2)}` : '****';
  }
}
