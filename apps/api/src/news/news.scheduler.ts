import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfig } from '../config/config.module';
import { JOB_NEWS_INGEST, QUEUE_NEWS } from '../queue/queue.constants';
import { NewsSourceService } from './sources/news-source.service';

/**
 * Seeds the launch-region news feeds and registers the repeatable ingestion job, so news flows
 * continuously without manual triggering. Mirrors LifecycleScheduler: BullMQ repeatable job keyed
 * by a fixed jobId (safe across API replicas), gated on SCHEDULER_ENABLED, off under NODE_ENV=test.
 *
 * Phased rollout: only the launched region's queries are seeded here; adding a state = adding rows.
 */
@Injectable()
export class NewsScheduler implements OnModuleInit {
  private readonly logger = new Logger(NewsScheduler.name);

  // Launch region (Telangana + Andhra Pradesh), English + Telugu. Broaden as regions launch.
  private static readonly SEED_FEEDS: Array<[string, string]> = [
    ['Hyderabad OR Gachibowli OR Madhapur OR Kondapur OR "Hitec City" OR Secunderabad', 'en'],
    ['హైదరాబాద్ OR గచ్చిబౌలి OR మాదాపూర్ OR సికింద్రాబాద్', 'te'],
    ['Warangal OR Karimnagar OR Nizamabad OR Khammam Telangana', 'en'],
    ['వరంగల్ OR కరీంనగర్ OR నిజామాబాద్ OR ఖమ్మం', 'te'],
    ['Vijayawada OR Visakhapatnam OR Guntur OR Nellore "Andhra Pradesh"', 'en'],
    ['విజయవాడ OR విశాఖపట్నం OR గుంటూరు OR నెల్లూరు', 'te'],
  ];

  constructor(
    @InjectQueue(QUEUE_NEWS) private readonly queue: Queue,
    private readonly config: AppConfig,
    private readonly sources: NewsSourceService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get('SCHEDULER_ENABLED') || this.config.get('NODE_ENV') === 'test') {
      this.logger.log('News scheduler disabled for this process');
      return;
    }
    void this.register().catch((e: unknown) => {
      this.logger.error(
        `News scheduler registration failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  }

  private async register(): Promise<void> {
    for (const [query, language] of NewsScheduler.SEED_FEEDS) {
      await this.sources.ensureGoogleNewsFeed(query, language);
    }
    // Every 5 minutes: pick up due feeds and ingest. Feeds self-throttle via nextFetchAt.
    await this.queue.add(
      JOB_NEWS_INGEST,
      {},
      { repeat: { pattern: '*/5 * * * *' }, jobId: 'repeat:news-ingest' },
    );
    this.logger.log(`News scheduler registered (${NewsScheduler.SEED_FEEDS.length} seed feeds)`);
  }
}
