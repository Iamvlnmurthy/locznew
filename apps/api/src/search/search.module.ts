import { Global, Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SearchIndexPublisher } from './search-index.publisher';
import { SearchProcessor } from './search.processor';
import { BusinessSearchService } from './business-search.service';
import { SearchLearningService } from './search-learning.service';
import { SearchService } from './search.service';

/**
 * Indexing only. The public /search endpoint lives with the listings module, which owns
 * listing hydration and mapping — keeping it there avoids a circular import and stops
 * the summary DTO being built in two places.
 */
@Global()
@Module({
  imports: [MediaModule],
  providers: [
    BusinessSearchService,
    SearchLearningService,SearchService, SearchIndexPublisher, SearchProcessor],
  exports: [
    BusinessSearchService,
    SearchLearningService,SearchService, SearchIndexPublisher],
})
export class SearchModule {}
