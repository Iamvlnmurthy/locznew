import { Injectable } from '@nestjs/common';
import { ImageScanSubject } from './image-scan-provider.interface';
import { ProtectedHashProvider, ProtectedHashResult } from './protected-hash-provider.interface';

/**
 * An explicit launch blocker, not a pretend detector.
 *
 * PhotoDNA and Thorn Safer are vetted services whose API contracts are supplied after
 * approval. Until one is procured, the platform reports UNAVAILABLE and keeps the image
 * in the normal private-review path. Production preflight refuses this provider.
 */
@Injectable()
export class UnconfiguredProtectedHashProvider implements ProtectedHashProvider {
  match(_subject: ImageScanSubject): Promise<ProtectedHashResult> {
    return Promise.resolve({
      status: 'UNAVAILABLE',
      provider: 'unconfigured',
      reasonCode: 'PROTECTED_HASH_PROVIDER_NOT_CONFIGURED',
    });
  }
}
