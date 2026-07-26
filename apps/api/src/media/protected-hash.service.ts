import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { ImageScanSubject } from './image-scan-provider.interface';
import {
  PROTECTED_HASH_PROVIDER,
  ProtectedHashProvider,
  ProtectedHashResult,
  validateProtectedHashResult,
} from './protected-hash-provider.interface';

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
        this.logger.warn(
          `Protected-hash attempt ${attempt}/${attempts} failed for ${subject.mediaId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
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
          timer = setTimeout(
            () => reject(new Error(`protected-hash provider timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
