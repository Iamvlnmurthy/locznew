import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { v7 as uuid } from 'uuid';
import { AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  roles: string[];
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresAt: Date;
}

export interface IssueTokenContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Refresh-token rotation with family revocation (ADR-0007).
 *
 * The refresh token is opaque random bytes, never a JWT: it carries no claims, so a
 * leaked token reveals nothing, and it can be revoked server-side immediately. Only
 * its SHA-256 is stored, so a database dump cannot be replayed against the API.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) throw new Error(`Unsupported TTL format: ${ttl}`);
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * (multipliers[unit as keyof typeof multipliers] ?? 1000);
  }

  async issuePair(
    userId: string,
    deviceId: string,
    roles: string[],
    permissions: string[],
    context: IssueTokenContext = {},
    familyId?: string,
    previousSessionId?: string,
  ): Promise<TokenPair> {
    const sessionId = uuid();
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTtlMs = this.parseTtlToMs(this.config.get('JWT_REFRESH_TTL'));
    const expiresAt = new Date(Date.now() + refreshTtlMs);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        deviceId,
        refreshTokenHash: this.hash(refreshToken),
        familyId: familyId ?? sessionId, // a fresh login starts its own family
        previousSessionId,
        expiresAt,
        ip: context.ip,
        userAgent: context.userAgent?.slice(0, 255),
      },
    });

    const payload: AccessTokenPayload = { sub: userId, sid: sessionId, roles, permissions };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      // Expressed in seconds rather than the "15m" string: jsonwebtoken's typings accept
      // only a narrow set of string literals, and the TTL comes from configuration.
      expiresIn: Math.floor(this.parseTtlToMs(this.config.get('JWT_ACCESS_TTL')) / 1000),
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.config.get('JWT_ACCESS_TTL'),
      refreshTokenExpiresAt: expiresAt,
    };
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * Presenting a token that has already been rotated means either a replay or a stolen
   * token being used alongside the legitimate client. Either way the whole family is
   * revoked — that is the entire point of tracking `familyId`.
   */
  async rotate(
    refreshToken: string,
    roles: string[],
    permissions: string[],
    context: IssueTokenContext = {},
  ): Promise<{ pair: TokenPair; userId: string }> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: this.hash(refreshToken) },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException('This session has been revoked. Please sign in again.');
    }

    if (session.rotatedAt) {
      await this.revokeFamily(session.familyId, 'REFRESH_TOKEN_REUSE_DETECTED');
      this.logger.warn(
        `Refresh token reuse detected for user ${session.userId}; family ${session.familyId} revoked`,
      );
      throw new UnauthorizedException('This session is no longer valid. Please sign in again.');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('This session has expired. Please sign in again.');
    }

    const pair = await this.issuePair(
      session.userId,
      session.deviceId,
      roles,
      permissions,
      context,
      session.familyId,
      session.id,
    );

    await this.prisma.session.update({
      where: { id: session.id },
      data: { rotatedAt: new Date() },
    });

    return { pair, userId: session.userId };
  }

  /**
   * Who a refresh token belongs to, without rotating it. Lets the caller load the
   * user's current roles before rotation mints a token that embeds them.
   */
  async resolveOwner(refreshToken: string): Promise<{ userId: string; sessionId: string } | null> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: this.hash(refreshToken) },
      select: { id: true, userId: true },
    });
    return session ? { userId: session.userId, sessionId: session.id } : null;
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Logout from all devices. */
  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  /** Logout from one device — revokes every session bound to it. */
  async revokeDevice(userId: string, deviceId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async isSessionActive(sessionId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, expiresAt: true },
    });
    return Boolean(session && !session.revokedAt && session.expiresAt.getTime() > Date.now());
  }
}
