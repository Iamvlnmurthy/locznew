import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MatchSavedSearchesJob, QUEUE_SAVED_SEARCHES } from '../queue/queue.constants';
import { SearchSubscriptionsService } from './search-subscriptions.service';

/**
 * Matches a newly published listing against every saved search that could want it.
 *
 * Off the request deliberately. A seller pressing Post should not wait while every watcher
 * in the city is evaluated, and the number of watchers grows with the city while the seller's
 * patience does not.
 *
 * Re-reads the listing rather than trusting the payload, in keeping with ADR-0005: by the
 * time this runs the listing may have been paused, edited or removed by a moderator, and an
 * alert for a listing nobody can open is worse than no alert.
 */
@Processor(QUEUE_SAVED_SEARCHES, { concurrency: 2 })
export class SearchSubscriptionsProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchSubscriptionsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SearchSubscriptionsService,
  ) {
    super();
  }

  async process(job: Job<MatchSavedSearchesJob>): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: job.data.listingId, deletedAt: null },
    });

    if (!listing) {
      this.logger.log(`Listing ${job.data.listingId} is gone; no alerts sent`);
      return;
    }

    await this.subscriptions.notifyMatches(listing);
  }
}
