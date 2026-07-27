import { NotFoundException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { RequestOtpDto, VerifyOtpDto } from '../src/auth/dto/auth.dto';

/**
 * Turning off the one-time-code routes.
 *
 * This exists because hiding the code form in the interface did nothing for security. The
 * endpoints stayed public, and while the provider was the shared trial PIN they would mint a
 * session for *any* phone number from four digits everybody knew. Worse than a weak login:
 * `verifyOtp` resolves an existing account by number and issues a session without ever
 * consulting a password, so it took over accounts whose owners had chosen a strong one.
 *
 * The guard lives in the service rather than the controller so that no future route, job or
 * internal caller can reach the flow around it.
 */
describe('one-time-code routes, when disabled', () => {
  const context = { ip: '203.0.113.9', userAgent: 'test', correlationId: 'c1' };

  function serviceWith(otpEnabled: boolean): AuthService {
    const config = { get: (key: string) => (key === 'AUTH_OTP_ENABLED' ? otpEnabled : 2) };
    return new AuthService(
      { user: { findUnique: jest.fn() } } as never,
      { issue: jest.fn(), verify: jest.fn() } as never,
      { issue: jest.fn() } as never,
      { grantRole: jest.fn() } as never,
      { record: jest.fn() } as never,
      config as never,
    );
  }

  const requestDto = { phone: '+919876500123' } as RequestOtpDto;
  const verifyDto = {
    phone: '+919876500123',
    code: '6426',
    device: { deviceKey: 'k', platform: 'WEB', name: 'n' },
  } as VerifyOtpDto;

  it('refuses to send a code', async () => {
    await expect(serviceWith(false).requestOtp(requestDto, context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to accept a code, which is the half that grants access', async () => {
    // Guarding only the request half would leave the door open: a code obtained earlier, or
    // a shared PIN, could still be redeemed for a session.
    await expect(serviceWith(false).verifyOtp(verifyDto, context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('says "not found" rather than "forbidden"', async () => {
    // While this is off the routes are not part of the product, and a prober learns nothing
    // about what might be turned on later.
    const error = await serviceWith(false)
      .verifyOtp(verifyDto, context)
      .catch((e: Error) => e);

    expect((error as NotFoundException).getStatus()).toBe(404);
  });

  it('still reaches the flow when enabled, so this is a switch and not a removal', async () => {
    // Proves the guard is what stops it — not something else incidentally broken — so the
    // code path can be turned back on when a real SMS provider is configured.
    const error = await serviceWith(true)
      .requestOtp(requestDto, context)
      .catch((e: Error) => e);

    expect(error).not.toBeInstanceOf(NotFoundException);
  });
});
