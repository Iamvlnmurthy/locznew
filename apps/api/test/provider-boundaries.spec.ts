import { AppConfig } from '../src/config/config.module';
import { validateEnv } from '../src/config/configuration';
import { Msg91OtpProvider } from '../src/auth/otp/msg91-otp.provider';
import { TwilioOtpProvider } from '../src/auth/otp/twilio-otp.provider';

const baseEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://locz:locz@localhost:5432/locz',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  OTP_PROVIDER: 'mock',
};

function config(values: Record<string, string | undefined>): AppConfig {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as AppConfig;
}

describe('provider environment boundaries', () => {
  it('rejects an incomplete selected MSG91 provider', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        OTP_PROVIDER: 'msg91',
        MSG91_AUTH_KEY: 'auth-key',
        MSG91_TEMPLATE_ID: 'template-id',
      }),
    ).toThrow('MSG91_SENDER_ID');
  });

  it('rejects Twilio without either supported credential pair', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        OTP_PROVIDER: 'twilio',
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_FROM_NUMBER: '+15551234567',
      }),
    ).toThrow('TWILIO_API_KEY_SID');
  });

  it('accepts a Twilio API key without requiring the primary Auth Token', () => {
    const env = validateEnv({
      ...baseEnv,
      OTP_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_API_KEY_SID: 'SK123',
      TWILIO_API_KEY_SECRET: 'key-secret',
      TWILIO_FROM_NUMBER: '+15551234567',
    });

    expect(env.OTP_PROVIDER).toBe('twilio');
  });

  it('rejects partial Firebase credentials before the API boots', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        FCM_PROJECT_ID: 'locz-production',
      }),
    ).toThrow('FCM configuration is partial');
  });

  it('rejects partial Rekognition credentials before the API boots', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        AWS_REKOGNITION_ACCESS_KEY_ID: 'AKIA_TEST',
      }),
    ).toThrow('AWS Rekognition credentials are partial');
  });

  it('rejects inverted Rekognition confidence thresholds', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        AWS_REKOGNITION_MIN_CONFIDENCE: 70,
        AWS_REKOGNITION_REVIEW_CONFIDENCE: 60,
        AWS_REKOGNITION_REJECT_CONFIDENCE: 90,
      }),
    ).toThrow('min <= review <= reject');
  });

  it.each(['photodna', 'thorn', 'safer'])(
    'rejects %s until that protected-hash adapter is actually compiled into this build',
    (provider) => {
      expect(() =>
        validateEnv({
          ...baseEnv,
          PROTECTED_HASH_PROVIDER: provider,
        }),
      ).toThrow('Invalid environment configuration');
    },
  );
});

describe('TwilioOtpProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses form encoding and the production API-key credentials', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: 'SM123' }),
    } as Response);
    const provider = new TwilioOtpProvider(
      config({
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_API_KEY_SID: 'SK123',
        TWILIO_API_KEY_SECRET: 'secret',
        TWILIO_AUTH_TOKEN: 'must-not-be-used',
        TWILIO_FROM_NUMBER: '+15551234567',
      }),
    );

    await expect(provider.send('+919876543210', '482913', 'LOGIN')).resolves.toEqual({
      messageId: 'SM123',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init.headers).toEqual({
      Authorization: `Basic ${Buffer.from('SK123:secret').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = init.body as URLSearchParams;
    expect(body.get('To')).toBe('+919876543210');
    expect(body.get('From')).toBe('+15551234567');
    expect(body.get('Body')).toContain('482913');
  });

  it('returns a generic failure without exposing the OTP', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'invalid credentials' }),
    } as Response);
    const provider = new TwilioOtpProvider(
      config({
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_FROM_NUMBER: '+15551234567',
      }),
    );

    await expect(provider.send('+919876543210', '482913', 'LOGIN')).rejects.toThrow(
      'Could not send the verification code',
    );
  });
});

describe('Msg91OtpProvider', () => {
  it('refuses to call the network when the sender ID is missing', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const provider = new Msg91OtpProvider(
      config({
        MSG91_AUTH_KEY: 'auth-key',
        MSG91_TEMPLATE_ID: 'template-id',
      }),
    );

    await expect(provider.send('+919876543210', '482913', 'LOGIN')).rejects.toThrow(
      'credentials are incomplete',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
