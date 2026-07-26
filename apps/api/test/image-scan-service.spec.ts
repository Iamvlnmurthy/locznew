import { ImageScanService } from '../src/media/image-scan.service';
import { QuarantineImageScanProvider } from '../src/media/quarantine-image-scan.provider';

describe('ImageScanService', () => {
  const subject = {
    mediaId: 'media-1',
    mimeType: 'image/jpeg',
    bytes: Buffer.from('safe synthetic fixture'),
    sha256: 'a'.repeat(64),
  };

  function config(timeoutMs = 50, attempts = 2) {
    return {
      get: jest.fn((key: string) => (key === 'IMAGE_SCANNER_TIMEOUT_MS' ? timeoutMs : attempts)),
    };
  }

  it('retries a transient provider failure', async () => {
    const provider = {
      scan: jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary upstream failure'))
        .mockResolvedValueOnce({
          decision: 'APPROVE' as const,
          reasons: [],
          provider: 'licensed-test-provider',
        }),
    };
    const service = new ImageScanService(provider, config() as never);

    await expect(service.scan(subject)).resolves.toEqual({
      decision: 'APPROVE',
      reasons: [],
      provider: 'licensed-test-provider',
    });
    expect(provider.scan).toHaveBeenCalledTimes(2);
  });

  it('fails closed when every provider attempt errors', async () => {
    const provider = {
      scan: jest.fn().mockRejectedValue(new Error('upstream unavailable')),
    };
    const service = new ImageScanService(provider, config(50, 2) as never);

    await expect(service.scan(subject)).resolves.toEqual({
      decision: 'REVIEW',
      reasons: ['IMAGE_SCANNER_UNAVAILABLE'],
      provider: 'fail-closed',
    });
    expect(provider.scan).toHaveBeenCalledTimes(2);
  });

  it('bounds a provider that never responds', async () => {
    const provider = {
      scan: jest.fn().mockImplementation(() => new Promise(() => undefined)),
    };
    const service = new ImageScanService(provider, config(5, 1) as never);

    await expect(service.scan(subject)).resolves.toMatchObject({
      decision: 'REVIEW',
      reasons: ['IMAGE_SCANNER_UNAVAILABLE'],
    });
  });
});

describe('QuarantineImageScanProvider', () => {
  it('never interprets missing vendor configuration as approval', async () => {
    const provider = new QuarantineImageScanProvider();

    await expect(
      provider.scan({
        mediaId: 'media-1',
        mimeType: 'image/jpeg',
        bytes: Buffer.from('safe synthetic fixture'),
        sha256: 'a'.repeat(64),
      }),
    ).resolves.toEqual({
      decision: 'REVIEW',
      reasons: ['IMAGE_SCANNER_NOT_CONFIGURED'],
      provider: 'quarantine',
    });
  });
});
