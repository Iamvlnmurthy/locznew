import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { PushProvider } from './push.provider';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor, PushProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
