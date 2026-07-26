import { Injectable } from '@nestjs/common';
import {
  ImageScanProvider,
  ImageScanSubject,
  ImageScanVerdict,
} from './image-scan-provider.interface';

/**
 * Honest default while no licensed image-safety provider is configured.
 *
 * Returning REVIEW keeps the image private and gives it to a person. Returning APPROVE
 * here would turn "scanner not purchased" into "safe", which is the exact failure mode
 * the quarantine boundary exists to prevent.
 */
@Injectable()
export class QuarantineImageScanProvider implements ImageScanProvider {
  scan(_subject: ImageScanSubject): Promise<ImageScanVerdict> {
    return Promise.resolve({
      decision: 'REVIEW',
      reasons: ['IMAGE_SCANNER_NOT_CONFIGURED'],
      provider: 'quarantine',
    });
  }
}
