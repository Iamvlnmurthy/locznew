import sharp from 'sharp';
import {
  RekognitionImageScanProvider,
  mapRekognitionLabels,
} from '../src/media/rekognition-image-scan.provider';

function config() {
  const values: Record<string, string | number | undefined> = {
    AWS_REKOGNITION_REGION: 'ap-south-1',
    AWS_REKOGNITION_ACCESS_KEY_ID: undefined,
    AWS_REKOGNITION_SECRET_ACCESS_KEY: undefined,
    AWS_REKOGNITION_MIN_CONFIDENCE: 50,
    AWS_REKOGNITION_REVIEW_CONFIDENCE: 60,
    AWS_REKOGNITION_REJECT_CONFIDENCE: 90,
  };
  return { get: jest.fn((key: string) => values[key]) };
}

describe('AWS Rekognition moderation policy mapping', () => {
  const reviewAt = 60;
  const rejectAt = 90;

  it('rejects high-confidence explicit content', () => {
    expect(
      mapRekognitionLabels(
        [{ Name: 'Explicit', Confidence: 98, ParentName: '', TaxonomyLevel: 1 }],
        reviewAt,
        rejectAt,
      ),
    ).toEqual({
      decision: 'REJECT',
      reasons: ['AWS_REKOGNITION_EXPLICIT'],
      provider: 'aws-rekognition',
    });
  });

  it('holds lower-confidence explicit content for a person', () => {
    expect(
      mapRekognitionLabels(
        [{ Name: 'Explicit', Confidence: 75, ParentName: '', TaxonomyLevel: 1 }],
        reviewAt,
        rejectAt,
      ),
    ).toMatchObject({
      decision: 'REVIEW',
      reasons: ['AWS_REKOGNITION_EXPLICIT'],
    });
  });

  it.each(['Violence', 'Drugs & Tobacco', 'Hate Symbols', 'Visually Disturbing'])(
    'holds %s for context instead of auto-rejecting it',
    (name) => {
      expect(
        mapRekognitionLabels(
          [{ Name: name, Confidence: 99, ParentName: '', TaxonomyLevel: 1 }],
          reviewAt,
          rejectAt,
        ),
      ).toMatchObject({ decision: 'REVIEW' });
    },
  );

  it('holds an unknown future top-level category', () => {
    expect(
      mapRekognitionLabels(
        [{ Name: 'Future Safety Category', Confidence: 99, ParentName: '', TaxonomyLevel: 1 }],
        reviewAt,
        rejectAt,
      ),
    ).toEqual({
      decision: 'REVIEW',
      reasons: ['AWS_REKOGNITION_FUTURE_SAFETY_CATEGORY'],
      provider: 'aws-rekognition',
    });
  });

  it('does not duplicate the reason when AWS returns a hierarchy', () => {
    expect(
      mapRekognitionLabels(
        [
          { Name: 'Violence', Confidence: 95, ParentName: '', TaxonomyLevel: 1 },
          { Name: 'Weapons', Confidence: 95, ParentName: 'Violence', TaxonomyLevel: 2 },
          {
            Name: 'Weapon Violence',
            Confidence: 95,
            ParentName: 'Graphic Violence',
            TaxonomyLevel: 3,
          },
        ],
        reviewAt,
        rejectAt,
      ),
    ).toEqual({
      decision: 'REVIEW',
      reasons: ['AWS_REKOGNITION_VIOLENCE'],
      provider: 'aws-rekognition',
    });
  });

  it('approves only when no top-level label reaches the review threshold', () => {
    expect(
      mapRekognitionLabels(
        [{ Name: 'Violence', Confidence: 55, ParentName: '', TaxonomyLevel: 1 }],
        reviewAt,
        rejectAt,
      ),
    ).toEqual({ decision: 'APPROVE', reasons: [], provider: 'aws-rekognition' });
  });
});

describe('RekognitionImageScanProvider request boundary', () => {
  it('sends private image bytes directly with the configured minimum confidence', async () => {
    const provider = new RekognitionImageScanProvider(config() as never);
    const send = jest.fn().mockResolvedValue({ ModerationLabels: [] });
    (provider as unknown as { client: { send: typeof send } }).client = { send };
    const bytes = await sharp({
      create: {
        width: 12,
        height: 12,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();

    await provider.scan({
      mediaId: 'media-1',
      mimeType: 'image/jpeg',
      bytes,
      sha256: 'a'.repeat(64),
    });

    const command = send.mock.calls[0]![0] as {
      input: { Image: { Bytes: Uint8Array }; MinConfidence: number };
    };
    expect(Buffer.from(command.input.Image.Bytes)).toEqual(bytes);
    expect(command.input.MinConfidence).toBe(50);
  });

  it('normalizes WebP to JPEG before calling an API that accepts only JPEG or PNG', async () => {
    const provider = new RekognitionImageScanProvider(config() as never);
    const send = jest.fn().mockResolvedValue({ ModerationLabels: [] });
    (provider as unknown as { client: { send: typeof send } }).client = { send };
    const webp = await sharp({
      create: {
        width: 12,
        height: 12,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .webp()
      .toBuffer();

    await provider.scan({
      mediaId: 'media-1',
      mimeType: 'image/webp',
      bytes: webp,
      sha256: 'a'.repeat(64),
    });

    const command = send.mock.calls[0]![0] as { input: { Image: { Bytes: Uint8Array } } };
    expect(Buffer.from(command.input.Image.Bytes).subarray(0, 3)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );
  });
});
