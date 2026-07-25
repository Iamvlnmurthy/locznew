import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  IndexListingJob,
  JOB_INDEX_LISTING,
  JOB_REINDEX_ALL,
  JOB_REMOVE_LISTING,
  QUEUE_SEARCH,
  RemoveListingJob,
} from '../queue/queue.constants';
import { SearchService } from './search.service';

/**
 * Keeps Meilisearch in step with the database. Concurrency is modest on purpose: a
 * publish storm should be absorbed by the queue, not turned into a thundering herd
 * against the search server.
 */
@Processor(QUEUE_SEARCH, { concurrency: 5 })
export class SearchProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchProcessor.name);

  constructor(private readonly search: SearchService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case JOB_INDEX_LISTING: {
        const { listingId } = job.data as IndexListingJob;
        const outcome = await this.search.indexListing(listingId);
        return { listingId, outcome };
      }

      case JOB_REMOVE_LISTING: {
        const { listingId } = job.data as RemoveListingJob;
        await this.search.removeListing(listingId);
        return { listingId, outcome: 'removed' };
      }

      case JOB_REINDEX_ALL:
        return this.search.reindexAll();

      default:
        // An unknown job name is a deployment mismatch, not a transient failure —
        // surface it rather than retrying it five times.
        this.logger.error(`Unknown job "${job.name}" on the ${QUEUE_SEARCH} queue`);
        return undefined;
    }
  }
}
