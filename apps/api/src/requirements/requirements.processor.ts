import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MatchRequirementJob, QUEUE_REQUIREMENTS } from '../queue/queue.constants';
import { RequirementsService } from './requirements.service';

/**
 * Announces a newly published requirement to sellers who deal in that category nearby.
 *
 * Off the request for the same reason the saved-search matcher is: a buyer pressing Post
 * should not wait while every seller in the city is considered, and the number of sellers
 * grows with the city while the buyer's patience does not.
 *
 * Re-reads the listing rather than trusting the payload (ADR-0005). By the time this runs a
 * moderator may have removed it, and announcing a requirement nobody can open is worse than
 * announcing nothing at all.
 */
@Processor(QUEUE_REQUIREMENTS, { concurrency: 2 })
export class RequirementsProcessor extends WorkerHost {
  private readonly logger = new Logger(RequirementsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requirements: RequirementsService,
  ) {
    super();
  }

  async process(job: Job<MatchRequirementJob>): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: job.data.listingId, deletedAt: null },
    });

    if (!listing) {
      this.logger.log(`Requirement ${job.data.listingId} is gone; no sellers told`);
      return;
    }

    await this.requirements.notifyMatchingSellers(listing);
  }
}
