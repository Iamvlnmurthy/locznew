import { Module, forwardRef } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchSubscriptionsController } from './search-subscriptions.controller';
import { SearchSubscriptionsProcessor } from './search-subscriptions.processor';
import { SearchSubscriptionsService } from './search-subscriptions.service';

@Module({
  // Circular by nature: listings tell saved searches about a new listing, and saved searches
  // ask listings whether it matches. Reusing the search path is worth this — the alternative
  // is a second implementation of every filter, drifting quietly out of step with the first.
  imports: [forwardRef(() => ListingsModule), NotificationsModule],
  controllers: [SearchSubscriptionsController],
  providers: [SearchSubscriptionsService, SearchSubscriptionsProcessor],
  exports: [SearchSubscriptionsService],
})
export class SearchSubscriptionsModule {}
