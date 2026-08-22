import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NEWS } from '../queue/queue.constants';
import { NewsController } from './news.controller';
import { GazetteerService } from './geo/gazetteer.service';
import { NewsIngestService } from './ingest/news-ingest.service';
import { NewsFeedService } from './feed/news-feed.service';
import { NewsSourceService } from './sources/news-source.service';
import { NewsRefineService } from './refine/news-refine.service';
import { NewsScheduler } from './news.scheduler';
import { NewsProcessor } from './news.processor';

/**
 * Hyperlocal news intelligence. Ingest (RSS → resolve → persist event) + the distance-ring feed.
 * Self-contained: its Prisma tables have no foreign keys into non-news tables, so the whole module
 * can be split to its own service/DB later. PrismaService + GeoRepository come from the global
 * PrismaModule.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NEWS })],
  controllers: [NewsController],
  providers: [
    GazetteerService,
    NewsIngestService,
    NewsFeedService,
    NewsSourceService,
    NewsRefineService,
    NewsScheduler,
    NewsProcessor,
  ],
  exports: [NewsIngestService, NewsSourceService],
})
export class NewsModule {}
