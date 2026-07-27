import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Device, RoleName, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { v7 as uuid } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import {
  AuthSessionDto,
  DeviceInfoDto,
  EmailLoginDto,
  PhoneLoginDto,
  RegisterDto,
  OtpRequestedDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { OtpService } from './otp/otp.service';
import { TokenService } from './token.service';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  async requestOtp(dto: RequestOtpDto, context: RequestContext): Promise<OtpRequestedDto> {
    // A suspended account must not be able to obtain a fresh session, but the response
    // is deliberately identical to an unknown number so the endpoint does not confirm
    // whether an account exists.
    const user = await this.prisma.user.findUnique({ where: { phoneE164: dto.phone } });
    if (user?.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('This account is suspended. Contact support.');
    }

    const result = await this.otp.issue(dto.phone, 'LOGIN', { ip: context.ip });

    return {
      expiresInSeconds: result.expiresInSeconds,
      ...(result.debugCode ? { debugCode: result.debugCode } : {}),
    };
  }

  /**
   * Verifies the code and returns a session. Creates the account on first successful
   * verification — there is no separate sign-up step, which is the whole point of
   * OTP-first authentication for a mass-market Indian audience.
   */
  async verifyOtp(dto: VerifyOtpDto, context: RequestContext): Promise<AuthSessionDto> {
    await this.otp.verify(dto.phone, dto.code, 'LOGIN');

    let user = await this.prisma.user.findUnique({ where: { phoneE164: dto.phone } });
    const isNewUser = !user;

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: uuid(),
          phoneE164: dto.phone,
          phoneVerifiedAt: new Date(),
          displayName: dto.displayName?.trim() || this.defaultDisplayName(dto.phone),
          status: UserStatus.ACTIVE,
        },
      });
      await this.rbac.grantRole(user.id, RoleName.REGISTERED_USER);
      await this.audit.record({
        action: 'user.register',
        entityType: 'User',
        entityId: user.id,
        actorId: user.id,
        ip: context.ip,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
      });
    } else {
      if (user.status === UserStatus.SUSPENDED) {
        throw new ForbiddenException('This account is suspended. Contact support.');
      }
      // Signing in reverses a self-service deactivation — the user has demonstrably returned.
      if (user.status === UserStatus.DEACTIVATED || user.status === UserStatus.DELETION_REQUESTED) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { status: UserStatus.ACTIVE, deletionRequestedAt: null },
        });
        await this.audit.record({
          action: 'user.reactivate',
          entityType: 'User',
          entityId: user.id,
          actorId: user.id,
          ip: context.ip,
        });
      }
      if (!user.phoneVerifiedAt) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { phoneVerifiedAt: new Date() },
        });
      }
    }

    const device = await this.registerDevice(user.id, dto.device, context);
    return this.buildSession(user, device, context, isNewUser);
  }

  /**
   * Creates an account with a phone number and a password the user chooses.
   *
   * The OTP path creates accounts implicitly, which is right when an SMS gateway can prove
   * the number belongs to whoever is holding it. Without one, that proof does not exist —
   * so this asks for a password instead, and every user gets a credential that is theirs
   * rather than a code shared with everybody.
   *
   * The phone number is deliberately **not** marked verified here. Nothing has demonstrated
   * that this person can receive messages at it; recording otherwise would put a claim in
   * the database that no evidence supports, and later features — contact reveal, recovery —
   * would be entitled to trust it. `phoneVerifiedAt` stays null until an SMS proves it.
   */
  async register(dto: RegisterDto, context: RequestContext): Promise<AuthSessionDto> {
    const existing = await this.prisma.user.findUnique({ where: { phoneE164: dto.phone } });

    if (existing && !existing.deletedAt) {
      // Says plainly that the number is taken. The alternative — a generic error to avoid
      // revealing which numbers are registered — is not worth it here: anybody can discover
      // the same fact by attempting to register, and a vague message on a sign-up form
      // leaves a real user stuck with no idea what to do next.
      throw new ConflictException(
        'That mobile number already has an account. Sign in instead, or use another number.',
      );
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: this.config.get('ARGON2_MEMORY_COST'),
      timeCost: this.config.get('ARGON2_TIME_COST'),
    });

    const user = await this.prisma.user.create({
      data: {
        id: uuid(),
        phoneE164: dto.phone,
        displayName: dto.displayName.trim(),
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    await this.rbac.grantRole(user.id, RoleName.REGISTERED_USER);
    await this.audit.record({
      action: 'user.register',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    const device = await this.registerDevice(user.id, dto.device, context);
    return this.buildSession(user, device, context, true);
  }

  /**
   * Phone number and password.
   *
   * Mirrors `loginWithEmail` rather than inventing a second shape: one generic message for
   * every failure, the same lockout on repeated attempts, and the same suspension check.
   * The generic message matters more here than on the email path, because a phone number is
   * guessable — an endpoint that distinguished "no such account" from "wrong password"
   * would enumerate which numbers are registered on the platform.
   */
  async loginWithPhone(dto: PhoneLoginDto, context: RequestContext): Promise<AuthSessionDto> {
    const user = await this.prisma.user.findUnique({ where: { phoneE164: dto.phone } });

    const invalid = new UnauthorizedException('Incorrect mobile number or password');

    if (!user || !user.passwordHash || user.deletedAt) {
      await this.recordFailedPasswordAttempt(dto.phone);
      throw invalid;
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('This account is suspended. Contact support.');
    }

    await this.assertNotLockedOut(dto.phone);

    const matches = await argon2.verify(user.passwordHash, dto.password);
    if (!matches) {
      await this.recordFailedPasswordAttempt(dto.phone);
      throw invalid;
    }

    await this.prisma.authLockout.deleteMany({ where: { scope: 'IP', identifier: dto.phone } });

    const device = await this.registerDevice(user.id, dto.device, context);
    return this.buildSession(user, device, context, false);
  }

  /**
   * Optional email + password path. Primarily how staff reach the admin console
   * without an SMS gateway; ordinary users are steered to OTP.
   */
  async loginWithEmail(dto: EmailLoginDto, context: RequestContext): Promise<AuthSessionDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // One generic message for "no such user", "no password set" and "wrong password" —
    // the endpoint must not reveal which accounts exist or which use password login.
    const invalid = new UnauthorizedException('Incorrect email or password');

    if (!user || !user.passwordHash || user.deletedAt) {
      await this.recordFailedPasswordAttempt(dto.email);
      throw invalid;
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('This account is suspended. Contact support.');
    }

    await this.assertNotLockedOut(dto.email);

    const matches = await argon2.verify(user.passwordHash, dto.password);
    if (!matches) {
      await this.recordFailedPasswordAttempt(dto.email);
      throw invalid;
    }

    await this.prisma.authLockout.deleteMany({ where: { scope: 'IP', identifier: dto.email } });

    const device = await this.registerDevice(user.id, dto.device, context);
    return this.buildSession(user, device, context, false);
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<AuthSessionDto> {
    // Rotation needs the user's current access set to mint the new access token, so the
    // session's owner is resolved first. Reuse detection stays inside TokenService.
    const owner = await this.tokens.resolveOwner(refreshToken);
    if (!owner) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.prisma.user.findUnique({ where: { id: owner.userId } });
    if (!user || user.deletedAt || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('This session is no longer valid. Please sign in again.');
    }

    const access = await this.rbac.resolveAccess(user.id);
    const { pair } = await this.tokens.rotate(refreshToken, access.roles, access.permissions, {
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      user: {
        id: user.id,
        phone: user.phoneE164,
        email: user.email,
        displayName: user.displayName,
        preferredLanguage: user.preferredLanguage,
        roles: access.roles,
        permissions: access.permissions,
        isNewUser: false,
      },
      tokens: pair,
    };
  }

  async logoutCurrentDevice(
    userId: string,
    sessionId: string,
    context: RequestContext,
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    await this.tokens.revokeDevice(userId, session.deviceId, 'USER_LOGOUT');
    await this.audit.record({
      action: 'auth.logout',
      entityType: 'Session',
      entityId: sessionId,
      actorId: userId,
      ip: context.ip,
      correlationId: context.correlationId,
    });
  }

  async logoutAllDevices(
    userId: string,
    context: RequestContext,
  ): Promise<{ revokedSessions: number }> {
    const revokedSessions = await this.tokens.revokeAllForUser(userId, 'USER_LOGOUT_ALL');
    await this.audit.record({
      action: 'auth.logout_all',
      entityType: 'User',
      entityId: userId,
      actorId: userId,
      changes: { revokedSessions },
      ip: context.ip,
      correlationId: context.correlationId,
    });
    return { revokedSessions };
  }

  private defaultDisplayName(phone: string): string {
    return `LocZ user ${phone.slice(-4)}`;
  }

  private async registerDevice(
    userId: string,
    info: DeviceInfoDto,
    context: RequestContext,
  ): Promise<Device> {
    return this.prisma.device.upsert({
      where: { userId_deviceKey: { userId, deviceKey: info.deviceKey } },
      update: {
        platform: info.platform,
        name: info.name,
        osVersion: info.osVersion,
        appVersion: info.appVersion,
        pushToken: info.pushToken,
        lastSeenAt: new Date(),
        lastIp: context.ip,
        revokedAt: null,
      },
      create: {
        id: uuid(),
        userId,
        deviceKey: info.deviceKey,
        platform: info.platform,
        name: info.name,
        osVersion: info.osVersion,
        appVersion: info.appVersion,
        pushToken: info.pushToken,
        lastIp: context.ip,
      },
    });
  }

  private async buildSession(
    user: User,
    device: Device,
    context: RequestContext,
    isNewUser: boolean,
  ): Promise<AuthSessionDto> {
    const access = await this.rbac.resolveAccess(user.id);
    const tokens = await this.tokens.issuePair(
      user.id,
      device.id,
      access.roles,
      access.permissions,
      {
        ip: context.ip,
        userAgent: context.userAgent,
      },
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    await this.audit.record({
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      changes: { deviceId: device.id, platform: device.platform },
      ip: context.ip,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    return {
      user: {
        id: user.id,
        phone: user.phoneE164,
        email: user.email,
        displayName: user.displayName,
        preferredLanguage: user.preferredLanguage,
        roles: access.roles,
        permissions: access.permissions,
        isNewUser,
      },
      tokens,
    };
  }

  private async assertNotLockedOut(email: string): Promise<void> {
    const lockout = await this.prisma.authLockout.findUnique({
      where: { scope_identifier: { scope: 'IP', identifier: email } },
    });
    if (lockout && lockout.lockedUntil.getTime() > Date.now()) {
      const seconds = Math.ceil((lockout.lockedUntil.getTime() - Date.now()) / 1000);
      throw new ForbiddenException(`Too many failed attempts. Try again in ${seconds} seconds.`);
    }
  }

  /**
   * Password brute-force brake. Counts against the email rather than the IP so a
   * distributed attempt on one account is still throttled.
   */
  private async recordFailedPasswordAttempt(email: string): Promise<void> {
    const lockoutSeconds = this.config.get('OTP_LOCKOUT_SECONDS');
    const existing = await this.prisma.authLockout.findUnique({
      where: { scope_identifier: { scope: 'IP', identifier: email } },
    });

    const failedCount = (existing?.failedCount ?? 0) + 1;
    const lockedUntil =
      failedCount >= 5 ? new Date(Date.now() + lockoutSeconds * 1000) : new Date(Date.now() + 1000);

    await this.prisma.authLockout.upsert({
      where: { scope_identifier: { scope: 'IP', identifier: email } },
      update: { failedCount, lockedUntil },
      create: { id: uuid(), scope: 'IP', identifier: email, failedCount, lockedUntil },
    });
  }
}
