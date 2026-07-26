import { ProtectedHashService } from '../src/media/protected-hash.service';
import { UnconfiguredProtectedHashProvider } from '../src/media/unconfigured-protected-hash.provider';

describe('ProtectedHashService', () => {
  const subject = {
    mediaId: 'media-1',
    mimeType: 'image/jpeg',
    bytes: Buffer.from('safe synthetic fixture'),
    sha256: 'a'.repeat(64),
  };

  function config(timeoutMs = 50, attempts = 2) {
    return {
      get: jest.fn((key: string) => (key === 'PROTECTED_HASH_TIMEOUT_MS' ? timeoutMs : attempts)),
    };
  }

  it('returns an opaque confirmed match without logging or interpreting it', async () => {
    const provider = {
      match: jest.fn().mockResolvedValue({
        status: 'MATCH' as const,
        provider: ' approved-test-provider ',
        reasonCode: ' KNOWN_PROTECTED_HASH_MATCH ',
        reference: ' opaque-provider-case ',
        rawHash: 'must-not-cross-the-adapter-boundary',
      }),
    };
    const service = new ProtectedHashService(provider, config() as never);

    const result = await service.match(subject);

    expect(result).toMatchObject({
      status: 'MATCH',
      provider: 'approved-test-provider',
      reasonCode: 'KNOWN_PROTECTED_HASH_MATCH',
      reference: 'opaque-provider-case',
    });
    expect(result).not.toHaveProperty('rawHash');
    expect(provider.match).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a missing match reference', { status: 'MATCH', provider: 'test', reasonCode: 'MATCH' }],
    ['an unknown status', { status: 'POSSIBLY', provider: 'test' }],
    ['an unavailable result without a reason', { status: 'UNAVAILABLE', provider: 'test' }],
    [
      'metadata that exceeds the database boundary',
      {
        status: 'MATCH',
        provider: 'p'.repeat(61),
        reasonCode: 'MATCH',
        reference: 'case-1',
      },
    ],
    [
      'control characters in metadata',
      {
        status: 'MATCH',
        provider: 'test',
        reasonCode: 'MATCH',
        reference: 'case-1\nleak',
      },
    ],
  ])('fails closed when an adapter returns %s', async (_label, result) => {
    const provider = { match: jest.fn().mockResolvedValue(result) };
    const service = new ProtectedHashService(provider as never, config(50, 2) as never);

    await expect(service.match(subject)).resolves.toEqual({
      status: 'UNAVAILABLE',
      provider: 'fail-closed',
      reasonCode: 'PROTECTED_HASH_PROVIDER_UNAVAILABLE',
    });
    expect(provider.match).toHaveBeenCalledTimes(2);
  });

  it('accepts a minimal no-match result and strips unrecognised provider fields', async () => {
    const provider = {
      match: jest.fn().mockResolvedValue({
        status: 'NO_MATCH',
        provider: 'approved-test-provider',
        vendorDebug: { score: 0 },
      }),
    };
    const service = new ProtectedHashService(provider as never, config() as never);

    await expect(service.match(subject)).resolves.toEqual({
      status: 'NO_MATCH',
      provider: 'approved-test-provider',
    });
  });

  it('retries transport failures and fails closed as unavailable', async () => {
    const provider = { match: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const service = new ProtectedHashService(provider, config(50, 2) as never);

    await expect(service.match(subject)).resolves.toEqual({
      status: 'UNAVAILABLE',
      provider: 'fail-closed',
      reasonCode: 'PROTECTED_HASH_PROVIDER_UNAVAILABLE',
    });
    expect(provider.match).toHaveBeenCalledTimes(2);
  });

  it('bounds a provider that never responds', async () => {
    const provider = {
      match: jest.fn().mockImplementation(() => new Promise(() => undefined)),
    };
    const service = new ProtectedHashService(provider, config(5, 1) as never);

    await expect(service.match(subject)).resolves.toMatchObject({
      status: 'UNAVAILABLE',
    });
  });
});

describe('UnconfiguredProtectedHashProvider', () => {
  it('is explicit that no protected matching occurred', async () => {
    const provider = new UnconfiguredProtectedHashProvider();

    await expect(
      provider.match({
        mediaId: 'media-1',
        mimeType: 'image/jpeg',
        bytes: Buffer.from('safe synthetic fixture'),
        sha256: 'a'.repeat(64),
      }),
    ).resolves.toEqual({
      status: 'UNAVAILABLE',
      provider: 'unconfigured',
      reasonCode: 'PROTECTED_HASH_PROVIDER_NOT_CONFIGURED',
    });
  });
});
