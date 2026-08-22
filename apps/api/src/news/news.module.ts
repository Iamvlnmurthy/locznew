import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { GazetteerService } from './geo/gazetteer.service';
import { NewsIngestService } from './ingest/news-ingest.service';
import { NewsFeedService } from './feed/news-feed.service';
import { NewsSourceService } from './sources/news-source.service';

/**
 * Hyperlocal news intelligence. Ingest (RSS → resolve → persist event) + the distance-ring feed.
 * Self-contained: its Prisma tables have no foreign keys into non-news tables, so the whole module
 * can be split to its own service/DB later. PrismaService + GeoRepository come from the global
 * PrismaModule.
 */
@Module({
  controllers: [NewsController],
  providers: [GazetteerService, NewsIngestService, NewsFeedService, NewsSourceService],
  exports: [NewsIngestService, NewsSourceService],
})
export class NewsModule {}
