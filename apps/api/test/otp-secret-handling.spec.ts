import { Logger } from '@nestjs/common';
import { TwilioOtpProvider } from '../src/auth/otp/twilio-otp.provider';
import { AppConfig } from '../src/config/config.module';

/**
 * A verification code is a bearer credential for ninety seconds, and an SMS auth token is
 * one indefinitely. Both have two ways out of the process: the HTTP response, and the log.
 *
 * The response is covered elsewhere. This covers the log, which is the easier one to leak
 * by accident and the harder one to notice — nothing fails, nobody is told, and the codes
 * sit in a file that gets shipped to a log aggregator and read by people who should never
 * see them.
 */
describe('OTP secret handling', () => {
  const CODE = '483920';
  const PHONE = '+919876543210';
  const AUTH_TOKEN = 'super-secret-auth-token';
  const API_SECRET = 'super-secret-api-key-secret';

  const config = {
    get: (key: string) =>
      ({
        TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
        TWILIO_API_KEY_SID: 'SK00000000000000000000000000000000',
        TWILIO_API_KEY_SECRET: API_SECRET,
        TWILIO_AUTH_TOKEN: AUTH_TOKEN,
        TWILIO_FROM_NUMBER: '+15005550006',
      })[key],
  } as unknown as AppConfig;

  /** Everything the provider tried to write anywhere, as one string. */
  let written: string[];

  beforeEach(() => {
    written = [];
    for (const level of ['log', 'error', 'warn', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        written.push(args.map((arg) => String(arg)).join(' '));
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  function stubTwilio(response: { ok: boolean; status: number; body: unknown }) {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    }) as unknown as typeof fetch;
  }

  it('never writes the code to a log on success', async () => {
    stubTwilio({ ok: true, status: 201, body: { sid: 'SM123' } });

    await new TwilioOtpProvider(config).send(PHONE, CODE, 'LOGIN');

    expect(written.join('\n')).not.toContain(CODE);
  });

  it('never writes the code to a log when the gateway rejects the send', async () => {
    stubTwilio({ ok: false, status: 400, body: { message: `Invalid body: ${CODE}` } });

    // The failure itself is expected; what matters is what it left behind.
    await expect(new TwilioOtpProvider(config).send(PHONE, CODE, 'LOGIN')).rejects.toThrow();

    expect(written.join('\n')).not.toContain(CODE);
  });

  it('never writes either credential to a log', async () => {
    stubTwilio({ ok: false, status: 401, body: { message: 'Authenticate' } });

    await expect(new TwilioOtpProvider(config).send(PHONE, CODE, 'LOGIN')).rejects.toThrow();

    const log = written.join('\n');
    expect(log).not.toContain(AUTH_TOKEN);
    expect(log).not.toContain(API_SECRET);
    // The Basic header is the same secret in another coat.
    expect(log).not.toContain(Buffer.from(`x:${API_SECRET}`).toString('base64').slice(4));
  });

  it('does not write the subscriber number in full', async () => {
    stubTwilio({ ok: false, status: 400, body: { message: 'Invalid' } });

    await expect(new TwilioOtpProvider(config).send(PHONE, CODE, 'LOGIN')).rejects.toThrow();

    // A masked number is enough to correlate a support call; the whole number in a log is
    // a subscriber list waiting to be exported.
    expect(written.join('\n')).not.toContain(PHONE);
  });

  it('returns no debug code, whatever the mock provider does', async () => {
    stubTwilio({ ok: true, status: 201, body: { sid: 'SM123' } });

    const result = await new TwilioOtpProvider(config).send(PHONE, CODE, 'LOGIN');

    // The response shape is what gates the API: `debugCode` is spread into the payload
    // only when a provider supplies one, so a real provider must never supply one.
    expect(result.debugCode).toBeUndefined();
    expect(Object.keys(result)).not.toContain('debugCode');
  });

  it('sends the code to Twilio and nowhere else', async () => {
    stubTwilio({ ok: true, status: 201, body: { sid: 'SM123' } });

    await new TwilioOtpProvider(config).send(PHONE, CODE, 'LOGIN');

    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain('api.twilio.com');
    expect(String(init.body)).toContain(CODE);
  });
});
