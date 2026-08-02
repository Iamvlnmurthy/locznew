import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { GoogleAuthService } from '../src/auth/google-auth.service';

/**
 * Sign in with Google.
 *
 * Every case here is about when a Google identity may be attached to a LocZ account.
 * Matching on an address Google has not verified is how account takeover happens: anyone can
 * put somebody else's address on a Google account, and a silent link would hand them the
 * other person's listings, chats and roles.
 */
describe('GoogleAuthService', () => {
  const account: {
    id: string;
    email: string;
    status: UserStatus;
    emailVerifiedAt: Date | null;
  } = {
    id: 'user-1',
    email: 'ravi@example.com',
    status: UserStatus.ACTIVE,
    emailVerifiedAt: null,
  };

  function build({
    clientId = 'client-id',
    payload = { email: 'ravi@example.com', email_verified: true, name: 'Ravi' } as Record<
      string,
      unknown
    > | null,
    user = account as typeof account | null,
    verifyThrows = false,
  } = {}) {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'created-1' }),
      },
    };
    const config = { get: jest.fn().mockReturnValue(clientId) };

    const service = new GoogleAuthService(prisma as never, config as never);
    // The client is constructed in the constructor; replace its verification so no network
    // call is made and the payload under test is the one Google would have returned.
    (service as unknown as { client: unknown }).client = {
      verifyIdToken: jest.fn(async () => {
        if (verifyThrows) throw new Error('invalid signature');
        return { getPayload: () => payload };
      }),
    };

    return { service, prisma, config };
  }

  const token = 'a'.repeat(40);

  it('signs in an existing account whose Google address is verified', async () => {
    const { service } = build();

    await expect(service.resolveUser(token)).resolves.toEqual({
      id: 'user-1',
      isNewUser: false,
    });
  });

  it('refuses an unverified Google email', async () => {
    const { service, prisma } = build({
      payload: { email: 'ravi@example.com', email_verified: false },
    });

    // Anyone can put somebody else's address on a Google account. Linking on that claim
    // would hand over the other person's listings, chats and roles.
    await expect(service.resolveUser(token)).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a token it cannot verify', async () => {
    const { service } = build({ verifyThrows: true });

    await expect(service.resolveUser(token)).rejects.toThrow(UnauthorizedException);
  });

  it('checks the token was minted for this application', async () => {
    const { service, config } = build();

    await service.resolveUser(token);

    // Without an audience check, a token from any Google app could be replayed here and
    // accepted as a LocZ login.
    const verify = (service as unknown as { client: { verifyIdToken: jest.Mock } }).client
      .verifyIdToken;
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ audience: 'client-id' }));
    expect(config.get).toHaveBeenCalledWith('GOOGLE_CLIENT_ID');
  });

  it('records that Google confirmed the address', async () => {
    const { service, prisma } = build();

    await service.resolveUser(token);

    // Password sign-up never established this, and it is what later lets the address be
    // trusted for password reset.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailVerifiedAt: expect.any(Date) } }),
    );
  });

  it('does not overwrite a verification already recorded', async () => {
    const { service, prisma } = build({ user: { ...account, emailVerifiedAt: new Date() } });

    await service.resolveUser(token);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a suspended account', async () => {
    const { service } = build({ user: { ...account, status: UserStatus.SUSPENDED } });

    await expect(service.resolveUser(token)).rejects.toThrow(UnauthorizedException);
  });

  // ---------------------------------------------------------------- creating an account
  describe('an address with no LocZ account', () => {
    it('creates one, rather than sending the person back to the sign-up form', async () => {
      const { service, prisma } = build({ user: null });

      // This used to throw, which made the Google button on the sign-up page a dead end:
      // it offered a way in and then told the reader to go and fill in the form it was
      // meant to replace.
      await expect(service.resolveUser(token)).resolves.toEqual({
        id: 'created-1',
        isNewUser: true,
      });
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('stores no phone number and invents no placeholder for one', async () => {
      const { service, prisma } = build({ user: null });

      await service.resolveUser(token);

      // A fabricated value would be indistinguishable from a real number in the
      // seller-contact column, and the unique index would reject the second account to
      // get the same one.
      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data.phoneE164).toBeNull();
    });

    it('records the address as verified, since that is why the account exists', async () => {
      const { service, prisma } = build({ user: null });

      await service.resolveUser(token);

      const { data } = prisma.user.create.mock.calls[0][0];
      expect(data.email).toBe('ravi@example.com');
      expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('greets the person by their Google name', async () => {
      const { service, prisma } = build({ user: null });

      await service.resolveUser(token);

      expect(prisma.user.create.mock.calls[0][0].data.displayName).toBe('Ravi');
    });

    it('falls back to the local part, never the whole address', async () => {
      const { service, prisma } = build({
        user: null,
        payload: { email: 'ravi@example.com', email_verified: true },
      });

      await service.resolveUser(token);

      // The display name appears on every listing card and message thread this account
      // touches. Putting an email address there would publish it.
      const { displayName } = prisma.user.create.mock.calls[0][0].data;
      expect(displayName).toBe('ravi');
      expect(displayName).not.toContain('@');
    });

    it('still refuses to create anything from an unverified address', async () => {
      const { service, prisma } = build({
        user: null,
        payload: { email: 'ravi@example.com', email_verified: false },
      });

      await expect(service.resolveUser(token)).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  it('reports unavailable rather than failing oddly when unconfigured', async () => {
    const { service } = build({ clientId: '' });

    await expect(service.resolveUser(token)).rejects.toThrow(ServiceUnavailableException);
  });
});
