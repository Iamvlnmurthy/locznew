import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LifecycleProcessor } from './lifecycle.processor';
import { LifecycleScheduler } from './lifecycle.scheduler';

@Module({
  imports: [AuditModule, MediaModule, ModerationModule, NotificationsModule],
  providers: [LifecycleProcessor, LifecycleScheduler],
})
export class LifecycleModule {}
