import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOB_NEWS_INGEST, JOB_NEWS_RETENTION, QUEUE_NEWS } from '../queue/queue.constants';
import { NewsIngestService } from './ingest/news-ingest.service';
import { NewsRetentionService } from './retention/news-retention.service';
import { NewsSourceService } from './sources/news-source.service';

/**
 * Runs the continuous news ingestion. On each repeatable tick it pulls the feeds whose nextFetchAt
 * is due and ingests them (bounded). Idempotent — re-running never duplicates articles/events.
 * Concurrency 1 so the launch region stays gentle on Google News.
 */
@Processor(QUEUE_NEWS, { concurrency: 1 })
export class NewsProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsProcessor.name);

  constructor(
    private readonly sources: NewsSourceService,
    private readonly ingest: NewsIngestService,
    private readonly retention: NewsRetentionService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === JOB_NEWS_RETENTION) {
      return this.retention.purgeExpired();
    }
    if (job.name !== JOB_NEWS_INGEST) {
      this.logger.error(`Unknown job "${job.name}" on the ${QUEUE_NEWS} queue`);
      return undefined;
    }
    const feeds = await this.sources.listDueFeeds(20);
    let created = 0;
    for (const feed of feeds) {
      const r = await this.ingest.ingestFeed(feed);
      created += r.created;
    }
    this.logger.log(`News ingest tick: ${feeds.length} feeds, ${created} new events`);
    return { feeds: feeds.length, created };
  }
}
