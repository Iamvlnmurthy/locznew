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
import { FirebaseAuthService } from './firebase-auth.service';
import { GoogleAuthService } from './google-auth.service';
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
  GoogleLoginDto,
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
    private readonly google: GoogleAuthService,
    private readonly firebase: FirebaseAuthService,
  ) {}

  /**
   * Refuses the one-time-code routes when the product does not offer them.
   *
   * A `NotFoundException` rather than a 403: the endpoints are not temporarily forbidden,
   * they are not part of the product while this is off, and saying "not found" tells a
   * prober nothing about what might be re-enabled later.
   */
  private assertOtpEnabled(): void {
    if (!this.config.get('AUTH_OTP_ENABLED')) {
      throw new NotFoundException('Cannot POST this route');
    }
  }

  async requestOtp(dto: RequestOtpDto, context: RequestContext): Promise<OtpRequestedDto> {
    this.assertOtpEnabled();
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
    this.assertOtpEnabled();
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
      // But only during the grace period: once the retention window has passed and the
      // anonymisation sweep has scrubbed the record (deletedAt set), the account is gone for
      // good and a stray login must not resurrect an emptied profile.
      if (
        user.deletedAt === null &&
        (user.status === UserStatus.DEACTIVATED || user.status === UserStatus.DELETION_REQUESTED)
      ) {
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
    const email = dto.email.trim().toLowerCase();

    const emailTaken = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
    if (emailTaken) {
      // Said plainly for the same reason as the number below: anybody can learn it by trying
      // to register anyway, and a vague message leaves a real person stuck.
      throw new ConflictException(
        'That email already has an account. Sign in instead, or use another address.',
      );
    }

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
        email,
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
   * Signing in with an email address and password.
   *
   * Email rather than the mobile number, because signing in must not depend on an SMS
   * arriving. The number is still collected at sign-up and still how a buyer reaches a
   * seller — it is identity and contact, not the key to the account.
   *
   * The failure message names neither the address nor the password, and the lockout counter
   * is keyed on the address. Telling somebody which half was wrong turns the form into a way
   * to discover who has an account here.
   */
  async loginWithEmail(dto: EmailLoginDto, context: RequestContext): Promise<AuthSessionDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });

    const invalid = new UnauthorizedException('Incorrect email or password');

    // Also covers an account that only ever signed in with Google: it has no password to
    // check, and saying so would confirm the address is registered.
    if (!user || !user.passwordHash) {
      await this.recordFailedPasswordAttempt(email);
      throw invalid;
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('This account is suspended. Contact support.');
    }

    await this.assertNotLockedOut(email);

    const matches = await argon2.verify(user.passwordHash, dto.password);
    if (!matches) {
      await this.recordFailedPasswordAttempt(email);
      throw invalid;
    }

    await this.prisma.authLockout.deleteMany({ where: { scope: 'IP', identifier: email } });

    const device = await this.registerDevice(user.id, dto.device, context);
    return this.buildSession(user, device, context, false);
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
   * Sign in with Google.
   *
   * The token is verified by `GoogleAuthService`; the session is issued here, through the
   * same `buildSession` every other path uses. Keeping session creation in one place is what
   * stops device registration, refresh rotation and lockout behaviour drifting apart between
   * sign-in methods.
   */
  async loginWithGoogle(dto: GoogleLoginDto, context: RequestContext): Promise<AuthSessionDto> {
    // Creates the account when the verified Google address has none, which is why this
    // reports whether it did: the session has to say `isNewUser` truthfully, and the web
    // client needs it to send a first-time Google user to /account/phone.
    const { id, isNewUser } = await this.google.resolveUser(dto.idToken);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('This account is suspended. Contact support.');
    }

    const device = await this.registerDevice(user.id, dto.device, context);
    return this.buildSession(user, device, context, isNewUser);
  }

  /**
   * Records that a mobile number was confirmed, through Firebase.
   *
   * The number is written as well as the timestamp, because the confirmed one is the truth: a
   * person who typed a digit wrong at sign-up and then verified their real number should end
   * up with the real one, not a verified flag on a number that is not theirs.
   *
   * Refuses a number already confirmed on another account. Numbers are unique and are how a
   * buyer reaches a seller — quietly moving one would take it from whoever had it.
   */
  async confirmPhone(userId: string, idToken: string): Promise<{ phoneE164: string }> {
    const { phoneE164 } = await this.firebase.verifyPhoneToken(idToken);

    const heldByAnother = await this.prisma.user.findFirst({
      where: { phoneE164, deletedAt: null, id: { not: userId } },
      select: { id: true },
    });
    if (heldByAnother) {
      throw new ConflictException('That mobile number is already on another LocZ account.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { phoneE164, phoneVerifiedAt: new Date() },
    });

    this.logger.log(`Phone confirmed for user ${userId}`);
    return { phoneE164 };
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
        requiresPhone: !user.phoneE164,
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
        // The only thing standing between a Google sign-up and a usable account. Sent on
        // every session, not just the first, so a person who closed the tab at /account/phone
        // is asked again next time rather than left half-registered and unreachable.
        requiresPhone: !user.phoneE164,
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
