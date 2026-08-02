import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';
import { PhoneLoginDto, RegisterDto } from '../src/auth/dto/auth.dto';

/**
 * Registration and sign-in with a phone number and a password the user chooses.
 *
 * The OTP path creates accounts implicitly, which is correct only when an SMS gateway has
 * proved the number belongs to whoever is holding it. Without one, these are what give each
 * user a credential of their own instead of a PIN shared with everybody.
 */
describe('phone and password authentication', () => {
  const context = { ip: '203.0.113.5', userAgent: 'test', correlationId: 'c1' };
  const device = { deviceKey: 'k1', platform: 'ANDROID', name: 'Test' };

  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    authLockout: { deleteMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock };
    device: { upsert: jest.Mock };
  };

  const config = { get: (key: string) => (key === 'ARGON2_MEMORY_COST' ? 19456 : 2) };

  function registerDto(overrides: Partial<RegisterDto> = {}): RegisterDto {
    return {
      email: 'anjali@example.com',
      phone: '+919876500123',
      displayName: 'Anjali Rao',
      password: 'a strong passphrase',
      device,
      ...overrides,
    } as RegisterDto;
  }

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      authLockout: {
        deleteMany: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      device: { upsert: jest.fn().mockResolvedValue({ id: 'd1' }) },
    };

    service = new AuthService(
      prisma as never,
      { verify: jest.fn(), issue: jest.fn() } as never,
      { issue: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }) } as never,
      { grantRole: jest.fn(), permissionsFor: jest.fn().mockResolvedValue([]) } as never,
      { record: jest.fn() } as never,
      config as never,
      // Google sign-in: verifies the token and resolves the account. Not what these
      // cases cover, so it is a stub.
      { resolveUser: jest.fn(), isConfigured: false } as never,
      // Firebase phone verification: same story, a stub.
      { verifyPhoneToken: jest.fn() } as never,
    );

    // The session builder reaches into collaborators these tests do not model; the subject
    // here is what happens *before* a session is minted.
    jest
      .spyOn(service as unknown as { buildSession: () => unknown }, 'buildSession')
      .mockResolvedValue({ tokens: { accessToken: 'a' } } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('registration', () => {
    it('stores the password hashed, never in the clear', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'u1', ...data }),
      );

      await service.register(registerDto(), context);

      const written = prisma.user.create.mock.calls[0][0].data as { passwordHash: string };
      expect(written.passwordHash).not.toContain('a strong passphrase');
      expect(written.passwordHash.startsWith('$argon2id$')).toBe(true);
      await expect(argon2.verify(written.passwordHash, 'a strong passphrase')).resolves.toBe(true);
    });

    it('does not claim the phone number is verified', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'u1', ...data }),
      );

      await service.register(registerDto(), context);

      // Nothing has proved this person can receive messages at the number. Recording a
      // verification would put a claim in the database that no evidence supports, and later
      // features would be entitled to trust it.
      const written = prisma.user.create.mock.calls[0][0].data as { phoneVerifiedAt?: unknown };
      expect(written.phoneVerifiedAt).toBeUndefined();
    });

    it('refuses a number that already has an account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', deletedAt: null });

      await expect(service.register(registerDto(), context)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('lets a deleted account free its number again', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'old', deletedAt: new Date() });
      prisma.user.create.mockResolvedValue({ id: 'u2' });

      await expect(service.register(registerDto(), context)).resolves.toBeDefined();
    });
  });

  describe('sign-in', () => {
    async function activeUser(password: string) {
      return {
        id: 'u1',
        phoneE164: '+919876500123',
        passwordHash: await argon2.hash(password),
        status: UserStatus.ACTIVE,
        deletedAt: null,
      };
    }

    function loginDto(password: string): PhoneLoginDto {
      return { phone: '+919876500123', password, device } as PhoneLoginDto;
    }

    it('accepts the right password', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUser('a strong passphrase'));

      await expect(
        service.loginWithPhone(loginDto('a strong passphrase'), context),
      ).resolves.toBeDefined();
    });

    it('rejects the wrong password and counts the attempt', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUser('a strong passphrase'));

      await expect(
        service.loginWithPhone(loginDto('not the password'), context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.authLockout.upsert).toHaveBeenCalled();
    });

    it('says the same thing for an unknown number as for a wrong password', async () => {
      // A phone number is guessable. An endpoint that distinguished the two would let
      // anybody enumerate which numbers are registered on the platform.
      prisma.user.findUnique.mockResolvedValue(null);
      const unknown = await service
        .loginWithPhone(loginDto('anything at all'), context)
        .catch((error: Error) => error);

      prisma.user.findUnique.mockResolvedValue(await activeUser('a strong passphrase'));
      const wrong = await service
        .loginWithPhone(loginDto('not the password'), context)
        .catch((error: Error) => error);

      expect((unknown as Error).message).toBe((wrong as Error).message);
    });

    it('refuses an account with no password rather than letting it through', async () => {
      // OTP-created accounts have a null hash. Treating null as "no password required"
      // would make every such account open to anyone who knows the number.
      const user = await activeUser('x');
      prisma.user.findUnique.mockResolvedValue({ ...user, passwordHash: null });

      await expect(service.loginWithPhone(loginDto('anything'), context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('refuses a suspended account even with the right password', async () => {
      const user = await activeUser('a strong passphrase');
      prisma.user.findUnique.mockResolvedValue({ ...user, status: UserStatus.SUSPENDED });

      await expect(
        service.loginWithPhone(loginDto('a strong passphrase'), context),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  /**
   * Signing in with an email address.
   *
   * The ordinary way in now. Email rather than the mobile number because signing in must not
   * depend on an SMS arriving — the number stays as identity and as how a buyer reaches a
   * seller, but it is no longer the key to the account.
   */
  describe('email sign-in', () => {
    async function account(password: string) {
      return {
        id: 'u1',
        email: 'anjali@example.com',
        passwordHash: await argon2.hash(password),
        status: UserStatus.ACTIVE,
        deletedAt: null,
      };
    }

    const dto = (password: string, email = 'anjali@example.com') =>
      ({ email, password, device }) as never;

    it('accepts the right password', async () => {
      prisma.user.findFirst.mockResolvedValue(await account('a strong passphrase'));

      await expect(
        service.loginWithEmail(dto('a strong passphrase'), context),
      ).resolves.toBeDefined();
    });

    it('matches an address whatever case it was typed in', async () => {
      prisma.user.findFirst.mockResolvedValue(await account('a strong passphrase'));

      // People capitalise the first letter on a phone keyboard without meaning to, and an
      // account they cannot reach because of it looks to them like a lost account.
      await service.loginWithEmail(dto('a strong passphrase', '  Anjali@Example.com '), context);

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'anjali@example.com', deletedAt: null } }),
      );
    });

    it('says the same thing for a wrong password and an unknown address', async () => {
      prisma.user.findFirst.mockResolvedValue(await account('a strong passphrase'));
      const wrongPassword = await service
        .loginWithEmail(dto('not the password'), context)
        .catch((error: Error) => error.message);

      prisma.user.findFirst.mockResolvedValue(null);
      const noAccount = await service
        .loginWithEmail(dto('a strong passphrase'), context)
        .catch((error: Error) => error.message);

      // Telling somebody which half was wrong turns the form into a way to discover who has
      // an account on the platform.
      expect(wrongPassword).toBe(noAccount);
    });

    it('refuses an account that only ever used Google', async () => {
      const google = await account('a strong passphrase');
      prisma.user.findFirst.mockResolvedValue({ ...google, passwordHash: null });

      // There is no password to check, and saying so would confirm the address is registered.
      await expect(service.loginWithEmail(dto('a strong passphrase'), context)).rejects.toThrow();
    });
  });
});
