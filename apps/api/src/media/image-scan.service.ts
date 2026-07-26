import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import {
  IMAGE_SCAN_PROVIDER,
  ImageScanProvider,
  ImageScanSubject,
  ImageScanVerdict,
} from './image-scan-provider.interface';

@Injectable()
export class ImageScanService {
  private readonly logger = new Logger(ImageScanService.name);

  constructor(
    @Inject(IMAGE_SCAN_PROVIDER) private readonly provider: ImageScanProvider,
    private readonly config: AppConfig,
  ) {}

  /**
   * Scanner outages are a moderation decision, not a processing failure.
   *
   * A failed image processor may delete a corrupt upload. A failed safety provider must
   * leave a valid upload private for retry or human review, so every exhausted failure is
   * converted to REVIEW rather than thrown into MediaService's generic failure path.
   */
  async scan(subject: ImageScanSubject): Promise<ImageScanVerdict> {
    const attempts = this.config.get('IMAGE_SCANNER_MAX_ATTEMPTS');
    const timeoutMs = this.config.get('IMAGE_SCANNER_TIMEOUT_MS');

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.withTimeout(this.provider.scan(subject), timeoutMs);
      } catch (error) {
        this.logger.warn(
          `Image scanner attempt ${attempt}/${attempts} failed for ${subject.mediaId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      decision: 'REVIEW',
      reasons: ['IMAGE_SCANNER_UNAVAILABLE'],
      provider: 'fail-closed',
    };
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`scanner timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
