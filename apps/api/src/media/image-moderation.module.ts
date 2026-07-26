import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { ImageModerationService } from './image-moderation.service';

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
  providers: [ImageModerationService],
  exports: [ImageModerationService],
})
export class ImageModerationModule {}
