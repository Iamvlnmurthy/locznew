import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { ImageScanSubject } from './image-scan-provider.interface';
import {
  PROTECTED_HASH_PROVIDER,
  ProtectedHashProvider,
  ProtectedHashResult,
  validateProtectedHashResult,
} from './protected-hash-provider.interface';

class ProtectedHashTimeoutError extends Error {}

@Injectable()
export class ProtectedHashService {
  private readonly logger = new Logger(ProtectedHashService.name);

  constructor(
    @Inject(PROTECTED_HASH_PROVIDER) private readonly provider: ProtectedHashProvider,
    private readonly config: AppConfig,
  ) {}

  async match(subject: ImageScanSubject): Promise<ProtectedHashResult> {
    const attempts = this.config.get('PROTECTED_HASH_MAX_ATTEMPTS');
    const timeoutMs = this.config.get('PROTECTED_HASH_TIMEOUT_MS');

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await this.withTimeout(this.provider.match(subject), timeoutMs);
        return validateProtectedHashResult(result);
      } catch (error) {
        // Adapter errors can contain raw vendor payloads, hashes or provider references.
        // Ordinary application logs may identify the media and failure class, but must
        // never copy an untrusted provider error message.
        const failure =
          error instanceof ProtectedHashTimeoutError ? 'timed out' : 'provider call failed';
        this.logger.warn(
          `Protected-hash attempt ${attempt}/${attempts} failed for ${subject.mediaId}: ${failure}`,
        );
      }
    }

    return {
      status: 'UNAVAILABLE',
      provider: 'fail-closed',
      reasonCode: 'PROTECTED_HASH_PROVIDER_UNAVAILABLE',
    };
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new ProtectedHashTimeoutError()), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
