import { Global, Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SearchIndexPublisher } from './search-index.publisher';
import { SearchProcessor } from './search.processor';
import { SearchService } from './search.service';

/**
 * Indexing only. The public /search endpoint lives with the listings module, which owns
 * listing hydration and mapping — keeping it there avoids a circular import and stops
 * the summary DTO being built in two places.
 */
@Global()
@Module({
  imports: [MediaModule],
  providers: [SearchService, SearchIndexPublisher, SearchProcessor],
  exports: [SearchService, SearchIndexPublisher],
})
export class SearchModule {}
