import { Module } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { QueueModule } from '../queue/queue.module';
import { ImageModerationService } from './image-moderation.service';
import { IMAGE_SCAN_PROVIDER } from './image-scan-provider.interface';
import { ImageScanService } from './image-scan.service';
import { QuarantineImageScanProvider } from './quarantine-image-scan.provider';
import { RekognitionImageScanProvider } from './rekognition-image-scan.provider';
import { PROTECTED_HASH_PROVIDER } from './protected-hash-provider.interface';
import { ProtectedHashService } from './protected-hash.service';
import { UnconfiguredProtectedHashProvider } from './unconfigured-protected-hash.provider';
import { MediaSafetyService } from './media-safety.service';
import { StorageService } from './storage.service';

/**
 * Image moderation belongs to neither the media module nor the moderation module.
 *
 * Media needs it to check an upload; moderation needs it to block one. Putting it in
 * either makes those two import each other, and a `forwardRef` only repairs Nest's
 * dependency graph — the ES modules still evaluate in a cycle, and the second to load sees
 * an uninitialised class.
 *
 * It depends on the queue rather than on SearchModule for the same reason: search imports
 * media to build its documents.
 */
@Module({
  imports: [QueueModule],
  providers: [
    ImageModerationService,
    ImageScanService,
    QuarantineImageScanProvider,
    RekognitionImageScanProvider,
    ProtectedHashService,
    UnconfiguredProtectedHashProvider,
    StorageService,
    MediaSafetyService,
    {
      provide: PROTECTED_HASH_PROVIDER,
      useExisting: UnconfiguredProtectedHashProvider,
    },
    {
      provide: IMAGE_SCAN_PROVIDER,
      inject: [AppConfig, QuarantineImageScanProvider, RekognitionImageScanProvider],
      useFactory: (
        config: AppConfig,
        quarantine: QuarantineImageScanProvider,
        rekognition: RekognitionImageScanProvider,
      ) => (config.get('IMAGE_SCANNER_PROVIDER') === 'rekognition' ? rekognition : quarantine),
    },
  ],
  exports: [ImageModerationService, ImageScanService, ProtectedHashService, MediaSafetyService],
})
export class ImageModerationModule {}
