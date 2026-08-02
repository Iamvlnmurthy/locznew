import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import {
  IMAGE_SCAN_PROVIDER,
  ImageScanProvider,
  ImageScanSubject,
  ImageScanVerdict,
} from './image-scan-provider.interface';

/**
 * A scan result, or the honest admission that there wasn't one.
 *
 * `UNAVAILABLE` is deliberately outside `ImageScanVerdict`: a provider may never claim it,
 * because a provider that could return "I am unavailable" instead of throwing would be
 * able to talk its way past the retry loop. Only this service produces it, and only after
 * every attempt has failed.
 */
export type ImageScanOutcome =
  ImageScanVerdict | { decision: 'UNAVAILABLE'; reasons: string[]; provider: string };

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
   * leave a valid upload intact, so every exhausted failure is converted to UNAVAILABLE
   * rather than thrown into MediaService's generic failure path.
   *
   * What UNAVAILABLE must *not* mean is REVIEW. That equivalence is what trapped every
   * image on production: the scanner could not be reached, each upload was quietly held
   * for a moderator, the listing published anyway, and the only visible symptom was a grey
   * placeholder. Nobody was told. `ImageModerationService` decides what to do with this,
   * and for a low-risk upload the answer is publish.
   */
  async scan(subject: ImageScanSubject): Promise<ImageScanOutcome> {
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

    // Loud, at error level, every time. A safety control that has stopped working must be
    // noisy: the last outage was invisible for weeks precisely because nothing said so.
    this.logger.error(
      `IMAGE_SCANNER_UNAVAILABLE: ${this.config.get('IMAGE_SCANNER_PROVIDER')} failed all ` +
        `${attempts} attempts for media ${subject.mediaId}. Uploads are now failing open — ` +
        `low-risk images publish unscanned and the rest queue for review.`,
    );

    return {
      decision: 'UNAVAILABLE',
      reasons: ['IMAGE_SCANNER_UNAVAILABLE'],
      provider: 'fail-open',
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
