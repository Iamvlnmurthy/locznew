import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [ListingsModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
