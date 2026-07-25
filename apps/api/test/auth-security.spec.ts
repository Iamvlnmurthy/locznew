import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { AppConfig } from '../src/config/config.module';
import { OtpService } from '../src/auth/otp/otp.service';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { MockOtpProvider } from '../src/auth/otp/mock-otp.provider';
import { makePrismaMock, makeRedisMock } from './factories';

/** Config double returning the documented defaults. */
function makeConfig(overrides: Record<string, unknown> = {}): AppConfig {
  const values: Record<string, unknown> = {
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    OTP_LENGTH: 6,
    OTP_TTL_SECONDS: 300,
    OTP_MAX_REQUESTS_PER_PHONE_PER_WINDOW: 3,
    OTP_REQUEST_WINDOW_SECONDS: 600,
    OTP_MAX_VERIFY_ATTEMPTS: 5,
    OTP_LOCKOUT_SECONDS: 900,
    ...overrides,
  };

  return { get: (key: string) => values[key] } as unknown as AppConfig;
}

describe('TokenService', () => {
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');

  function build(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = makePrismaMock(prismaOverrides) as unknown as PrismaService;
    const service = new TokenService(new JwtService({}), prisma, makeConfig());
    return { prisma, service };
  }

  beforeEach(() => jest.clearAllMocks());

  it('stores only a hash of the refresh token, never the token itself', async () => {
    const { prisma, service } = build();
    (prisma.session.create as jest.Mock).mockResolvedValue({});

    const pair = await service.issuePair('user-1', 'device-1', ['REGISTERED_USER'], []);
    const created = (prisma.session.create as jest.Mock).mock.calls[0][0];

    expect(created.data.refreshTokenHash).toBe(hash(pair.refreshToken));
    expect(JSON.stringify(created.data)).not.toContain(pair.refreshToken);
  });

  it('starts a new token family on a fresh login', async () => {
    const { prisma, service } = build();
    (prisma.session.create as jest.Mock).mockResolvedValue({});

    await service.issuePair('user-1', 'device-1', [], []);
    const created = (prisma.session.create as jest.Mock).mock.calls[0][0];

    // A login's family id is its own session id — descendants inherit it.
    expect(created.data.familyId).toBe(created.data.id);
    expect(created.data.previousSessionId).toBeUndefined();
  });

  it('embeds roles and permissions in the access token', async () => {
    const { prisma, service } = build();
    (prisma.session.create as jest.Mock).mockResolvedValue({});

    const pair = await service.issuePair('user-1', 'device-1', ['MODERATOR'], ['listing:moderate']);
    const claims = JSON.parse(
      Buffer.from(pair.accessToken.split('.')[1]!, 'base64url').toString(),
    ) as Record<string, unknown>;

    expect(claims.sub).toBe('user-1');
    expect(claims.roles).toEqual(['MODERATOR']);
    expect(claims.permissions).toEqual(['listing:moderate']);
    // 15 minutes, expressed in seconds.
    expect((claims.exp as number) - (claims.iat as number)).toBe(900);
  });

  it('revokes the entire family when an already-rotated token is presented', async () => {
    // This is the theft-detection case: the legitimate client rotated, then someone
    // replayed the old token.
    const { prisma, service } = build();
    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      deviceId: 'device-1',
      familyId: 'family-1',
      rotatedAt: new Date('2026-01-01T00:00:00Z'),
      revokedAt: null,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    });

    await expect(service.rotate('stolen-token', [], [])).rejects.toThrow(UnauthorizedException);

    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: 'family-1', revokedAt: null },
        data: expect.objectContaining({ revokedReason: 'REFRESH_TOKEN_REUSE_DETECTED' }),
      }),
    );
  });

  it('refuses a revoked session', async () => {
    const { prisma, service } = build();
    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      id: 's',
      userId: 'u',
      deviceId: 'd',
      familyId: 'f',
      rotatedAt: null,
      revokedAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    });

    await expect(service.rotate('token', [], [])).rejects.toThrow('revoked');
  });

  it('refuses an expired session', async () => {
    const { prisma, service } = build();
    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      id: 's',
      userId: 'u',
      deviceId: 'd',
      familyId: 'f',
      rotatedAt: null,
      revokedAt: null,
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    });

    await expect(service.rotate('token', [], [])).rejects.toThrow('expired');
  });

  it('carries the family forward when rotation succeeds', async () => {
    const { prisma, service } = build();
    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      deviceId: 'device-1',
      familyId: 'family-1',
      rotatedAt: null,
      revokedAt: null,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    });
    (prisma.session.create as jest.Mock).mockResolvedValue({});

    const { pair } = await service.rotate('good-token', [], []);
    const created = (prisma.session.create as jest.Mock).mock.calls[0][0];

    expect(created.data.familyId).toBe('family-1');
    expect(created.data.previousSessionId).toBe('session-1');
    expect(pair.refreshToken).toBeDefined();
    // The consumed token is marked rotated, so replaying it now trips the check above.
    expect(prisma.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session-1' } }),
    );
  });

  it('treats a session as inactive once revoked', async () => {
    const { prisma, service } = build();
    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    });

    await expect(service.isSessionActive('session-1')).resolves.toBe(false);
  });
});

describe('OtpService', () => {
  function build(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = makePrismaMock(prismaOverrides) as unknown as PrismaService;
    const redis = makeRedisMock();
    const service = new OtpService(
      new MockOtpProvider(),
      prisma,
      redis as unknown as RedisService,
      makeConfig(),
    );
    return { prisma, redis, service };
  }

  beforeEach(() => jest.clearAllMocks());

  it('stores a hash of the code, never the code', async () => {
    const { prisma, service } = build();
    (prisma.otpAttempt.create as jest.Mock).mockResolvedValue({});

    const result = await service.issue('+919876543210', 'LOGIN');
    const created = (prisma.otpAttempt.create as jest.Mock).mock.calls[0][0];

    expect(result.debugCode).toMatch(/^\d{6}$/);
    expect(created.data.codeHash).toBe(
      createHash('sha256').update(result.debugCode!).digest('hex'),
    );
    expect(created.data).not.toHaveProperty('code');
  });

  it('invalidates any previous unconsumed code, so only the newest works', async () => {
    const { prisma, service } = build();
    (prisma.otpAttempt.create as jest.Mock).mockResolvedValue({});

    await service.issue('+919876543210', 'LOGIN');

    expect(prisma.otpAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phoneE164: '+919876543210', purpose: 'LOGIN', consumedAt: null },
      }),
    );
  });

  it('refuses once the per-phone request limit is exceeded', async () => {
    const { redis, service } = build();
    redis.incrementWithWindow.mockResolvedValue(4); // limit is 3

    await expect(service.issue('+919876543210', 'LOGIN')).rejects.toThrow(
      'Too many verification codes requested',
    );
  });

  it('refuses while a lockout is in force', async () => {
    const { service } = build({
      authLockout: {
        ...makePrismaMock().authLockout,
        findUnique: jest.fn().mockResolvedValue({
          id: 'lock-1',
          lockedUntil: new Date(Date.now() + 600_000),
        }),
      },
    });

    await expect(service.issue('+919876543210', 'LOGIN')).rejects.toThrow(ForbiddenException);
  });

  it('clears an expired lockout instead of blocking forever', async () => {
    const authLockout = {
      ...makePrismaMock().authLockout,
      findUnique: jest.fn().mockResolvedValue({
        id: 'lock-1',
        lockedUntil: new Date(Date.now() - 1000),
      }),
      delete: jest.fn(),
    };
    const { prisma, service } = build({ authLockout });
    (prisma.otpAttempt.create as jest.Mock).mockResolvedValue({});

    await expect(service.issue('+919876543210', 'LOGIN')).resolves.toBeDefined();
    expect(authLockout.delete).toHaveBeenCalledWith({ where: { id: 'lock-1' } });
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const { prisma, service } = build();
    (prisma.otpAttempt.findFirst as jest.Mock).mockResolvedValue({
      id: 'attempt-1',
      codeHash: createHash('sha256').update('111111').digest('hex'),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.otpAttempt.update as jest.Mock).mockResolvedValue({ attempts: 1, maxAttempts: 5 });

    await expect(service.verify('+919876543210', '222222', 'LOGIN')).rejects.toThrow(
      '4 attempt(s) remaining',
    );
  });

  it('locks out on the final failed attempt', async () => {
    const { prisma, service } = build();
    (prisma.otpAttempt.findFirst as jest.Mock).mockResolvedValue({
      id: 'attempt-1',
      codeHash: createHash('sha256').update('111111').digest('hex'),
      attempts: 4,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.otpAttempt.update as jest.Mock).mockResolvedValue({ attempts: 5, maxAttempts: 5 });

    await expect(service.verify('+919876543210', '222222', 'LOGIN')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.authLockout.upsert).toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    const { prisma, service } = build();
    (prisma.otpAttempt.findFirst as jest.Mock).mockResolvedValue({
      id: 'attempt-1',
      codeHash: createHash('sha256').update('111111').digest('hex'),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.verify('+919876543210', '111111', 'LOGIN')).rejects.toThrow('expired');
  });

  it('consumes the code and clears the failure counters on success', async () => {
    const { prisma, redis, service } = build();
    (prisma.otpAttempt.findFirst as jest.Mock).mockResolvedValue({
      id: 'attempt-1',
      codeHash: createHash('sha256').update('111111').digest('hex'),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.verify('+919876543210', '111111', 'LOGIN')).resolves.toBeUndefined();

    expect(prisma.otpAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.authLockout.deleteMany).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('otp:req:phone:+919876543210');
  });

  it('rejects verification when no code is pending', async () => {
    const { service } = build();

    await expect(service.verify('+919876543210', '111111', 'LOGIN')).rejects.toThrow(
      'No verification code is pending',
    );
  });
});
