import {
  DetectModerationLabelsCommand,
  ModerationLabel,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { AppConfig } from '../config/config.module';
import {
  ImageScanProvider,
  ImageScanSubject,
  ImageScanVerdict,
} from './image-scan-provider.interface';

const EXPLICIT_CATEGORY = 'Explicit';

function reasonFor(name: string): string {
  return `AWS_REKOGNITION_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
}

export function mapRekognitionLabels(
  labels: ModerationLabel[],
  reviewThreshold: number,
  rejectThreshold: number,
): ImageScanVerdict {
  const topLevel = labels.filter(
    (label) =>
      label.Name && (label.TaxonomyLevel === 1 || (!label.TaxonomyLevel && !label.ParentName)),
  );
  const explicit = topLevel.find(
    (label) => label.Name === EXPLICIT_CATEGORY && (label.Confidence ?? 0) >= rejectThreshold,
  );

  if (explicit) {
    return {
      decision: 'REJECT',
      reasons: [reasonFor(EXPLICIT_CATEGORY)],
      provider: 'aws-rekognition',
    };
  }

  const review = topLevel.filter((label) => (label.Confidence ?? 0) >= reviewThreshold);
  if (review.length > 0) {
    return {
      decision: 'REVIEW',
      reasons: [...new Set(review.map((label) => reasonFor(label.Name!)))],
      provider: 'aws-rekognition',
    };
  }

  return { decision: 'APPROVE', reasons: [], provider: 'aws-rekognition' };
}

/**
 * AWS Rekognition content-classification adapter.
 *
 * This is deliberately not called a CSAM detector: DetectModerationLabels classifies
 * visual content but does not match protected known-CSAM hash databases. That remains a
 * separate provider and legal workflow.
 */
@Injectable()
export class RekognitionImageScanProvider implements ImageScanProvider {
  private readonly client: RekognitionClient;

  constructor(private readonly config: AppConfig) {
    const accessKeyId = config.get('AWS_REKOGNITION_ACCESS_KEY_ID');
    const secretAccessKey = config.get('AWS_REKOGNITION_SECRET_ACCESS_KEY');
    this.client = new RekognitionClient({
      region: config.get('AWS_REKOGNITION_REGION'),
      // On AWS compute the default credential chain resolves the task/instance role.
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }

  async scan(subject: ImageScanSubject): Promise<ImageScanVerdict> {
    // Rekognition accepts JPEG and PNG. LocZ also accepts WebP and HEIC, so normalize only
    // the bytes sent to AWS; the private original and sanitized public renditions retain
    // their existing pipeline.
    const bytes =
      subject.mimeType === 'image/jpeg' || subject.mimeType === 'image/png'
        ? subject.bytes
        : await sharp(subject.bytes).rotate().jpeg({ quality: 90 }).toBuffer();

    const response = await this.client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: bytes },
        MinConfidence: this.config.get('AWS_REKOGNITION_MIN_CONFIDENCE'),
      }),
    );

    return mapRekognitionLabels(
      response.ModerationLabels ?? [],
      this.config.get('AWS_REKOGNITION_REVIEW_CONFIDENCE'),
      this.config.get('AWS_REKOGNITION_REJECT_CONFIDENCE'),
    );
  }
}
