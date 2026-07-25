import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { MediaModule } from '../media/media.module';
import { ModerationModule } from '../moderation/moderation.module';
import { ListingsController } from './listings.controller';
import { ListingDetailsBuilder } from './listing-details.builder';
import { ListingsService } from './listings.service';
import { SearchController } from './search.controller';
import { SearchQueryService } from './search-query.service';

@Module({
  imports: [CategoriesModule, ModerationModule, MediaModule],
  controllers: [ListingsController, SearchController],
  providers: [ListingsService, SearchQueryService, ListingDetailsBuilder],
  exports: [ListingsService],
})
export class ListingsModule {}
