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
  const account = {
    id: 'user-1',
    email: 'ravi@example.com',
    status: UserStatus.ACTIVE,
    emailVerifiedAt: null as Date | null,
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

    await expect(service.resolveUser(token)).resolves.toEqual({ id: 'user-1' });
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

  it('does not create an account for an unknown address', async () => {
    const { service } = build({ user: null });

    // phoneE164 is NOT NULL and unique, and the number is how sellers are contacted. A
    // mobile marketplace account without one is half an account.
    await expect(service.resolveUser(token)).rejects.toThrow(UnauthorizedException);
  });

  it('reports unavailable rather than failing oddly when unconfigured', async () => {
    const { service } = build({ clientId: '' });

    await expect(service.resolveUser(token)).rejects.toThrow(ServiceUnavailableException);
  });
});
