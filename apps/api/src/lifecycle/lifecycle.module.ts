import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LifecycleProcessor } from './lifecycle.processor';
import { LifecycleScheduler } from './lifecycle.scheduler';

@Module({
  imports: [MediaModule, NotificationsModule],
  providers: [LifecycleProcessor, LifecycleScheduler],
})
export class LifecycleModule {}
