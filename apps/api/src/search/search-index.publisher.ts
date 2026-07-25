import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JOB_INDEX_LISTING, JOB_REMOVE_LISTING, QUEUE_SEARCH } from '../queue/queue.constants';

/**
 * The only way anything enqueues search work.
 *
 * Enqueue failures are swallowed deliberately: if Redis is briefly unavailable, the
 * user's listing must still save. The nightly consistency reindex repairs whatever was
 * missed — which is only tolerable because Postgres, not Meilisearch, is the truth.
 */
@Injectable()
export class SearchIndexPublisher {
  private readonly logger = new Logger(SearchIndexPublisher.name);

  constructor(@InjectQueue(QUEUE_SEARCH) private readonly queue: Queue) {}

  async enqueueIndex(listingId: string): Promise<void> {
    try {
      await this.queue.add(
        JOB_INDEX_LISTING,
        { listingId },
        // One pending job per listing: rapid edits collapse into a single index write,
        // and the worker reads current state anyway.
        { jobId: `index:${listingId}`, removeOnComplete: true },
      );
    } catch (error) {
      this.logger.error(
        `Could not enqueue indexing for ${listingId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async enqueueRemoval(listingId: string): Promise<void> {
    try {
      await this.queue.add(
        JOB_REMOVE_LISTING,
        { listingId },
        { jobId: `remove:${listingId}`, removeOnComplete: true },
      );
    } catch (error) {
      this.logger.error(
        `Could not enqueue removal for ${listingId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
