import { validateEnv } from '../src/config/configuration';

/**
 * The shared trial PIN, and the guards that keep it out of production.
 *
 * A PIN is one credential for every account. It exists so a closed trial can be used without
 * an SMS gateway, and the only reason that is acceptable is that it cannot escape: the
 * configuration refuses to boot with it in production, exactly as it does for the mock
 * provider. These tests are the thing standing between "convenient for a trial" and "four
 * digits is our authentication".
 */
describe('the shared trial PIN', () => {
  /** A configuration that is valid apart from whatever a test overrides. */
  function env(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
      REDIS_URL: 'redis://127.0.0.1:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
      STORAGE_BUCKET: 'media',
      STORAGE_ACCESS_KEY_ID: 'key',
      STORAGE_SECRET_ACCESS_KEY: 'secret',
      STORAGE_PUBLIC_BASE_URL: 'http://127.0.0.1:9000/media',
      MEILI_HOST: 'http://127.0.0.1:7700',
      ...overrides,
    };
  }

  it('never boots in production, however it is configured', () => {
    // The whole safety argument rests on this one assertion.
    expect(() =>
      validateEnv(env({ NODE_ENV: 'production', OTP_PROVIDER: 'pin', OTP_FIXED_CODE: '1234' })),
    ).toThrow(/not permitted when NODE_ENV=production/);
  });

  it('refuses to run without a PIN to check against', () => {
    // Without this, `pin` would fall through to a randomly generated code that is never
    // delivered anywhere — an app nobody can sign into, failing silently.
    expect(() => validateEnv(env({ OTP_PROVIDER: 'pin' }))).toThrow(/requires OTP_FIXED_CODE/);
  });

  it('rejects a PIN whose length does not match OTP_LENGTH', () => {
    // A four-digit PIN with OTP_LENGTH=6 produces a code that can never be entered, and the
    // failure would look like "wrong PIN" to every tester rather than a misconfiguration.
    expect(() =>
      validateEnv(env({ OTP_PROVIDER: 'pin', OTP_FIXED_CODE: '1234', OTP_LENGTH: '6' })),
    ).toThrow(/must match or the PIN can never be entered/);
  });

  it('accepts a four-digit PIN with OTP_LENGTH=4', () => {
    const config = validateEnv(
      env({ OTP_PROVIDER: 'pin', OTP_FIXED_CODE: '4271', OTP_LENGTH: '4' }),
    );

    expect(config.OTP_PROVIDER).toBe('pin');
    expect(config.OTP_FIXED_CODE).toBe('4271');
  });

  it('rejects anything that is not digits', () => {
    for (const bad of ['12a4', 'abcd', '12 4', '123', '123456789', '']) {
      expect(() =>
        validateEnv(env({ OTP_PROVIDER: 'pin', OTP_FIXED_CODE: bad, OTP_LENGTH: '4' })),
      ).toThrow();
    }
  });

  it('leaves the attempt limits alone, which is what makes a PIN survivable', () => {
    // Four digits is ten thousand possibilities. The reason a closed trial can live with
    // that is the lockout: five wrong guesses per phone, then fifteen minutes of silence.
    // If either of these ever defaults to something permissive, the PIN stops being safe.
    const config = validateEnv(
      env({ OTP_PROVIDER: 'pin', OTP_FIXED_CODE: '4271', OTP_LENGTH: '4' }),
    );

    expect(config.OTP_MAX_VERIFY_ATTEMPTS).toBeLessThanOrEqual(5);
    expect(config.OTP_LOCKOUT_SECONDS).toBeGreaterThanOrEqual(300);
  });
});
