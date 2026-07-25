import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfig } from '../config/config.module';
import {
  JOB_EXPIRE_LISTINGS,
  JOB_REINDEX_ALL,
  JOB_SWEEP_ORPHAN_MEDIA,
  JOB_SWEEP_SESSIONS,
  JOB_TRIM_RECENTLY_VIEWED,
  JOB_WARN_EXPIRING,
  QUEUE_LIFECYCLE,
  QUEUE_SEARCH,
} from '../queue/queue.constants';

/**
 * Registers the repeatable jobs.
 *
 * BullMQ's repeatable scheduler is used rather than a per-instance cron so that running
 * several API replicas does not run each sweep several times — the schedule lives in
 * Redis, and a fixed job key makes re-registration on every boot idempotent.
 */
@Injectable()
export class LifecycleScheduler implements OnModuleInit {
  private readonly logger = new Logger(LifecycleScheduler.name);

  constructor(
    @InjectQueue(QUEUE_LIFECYCLE) private readonly lifecycle: Queue,
    @InjectQueue(QUEUE_SEARCH) private readonly search: Queue,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.get('SCHEDULER_ENABLED') || this.config.get('NODE_ENV') === 'test') {
      this.logger.log('Scheduled jobs are disabled for this process');
      return;
    }

    // Not awaited: registering repeatable jobs talks to Redis, and an unreachable Redis
    // must not stop the API booting. A missed registration is recovered on the next boot.
    void this.register().catch((error: unknown) => {
      this.logger.error(
        `Could not register scheduled jobs: ${error instanceof Error ? error.message : error}`,
      );
    });
  }

  private async register(): Promise<void> {
    // Every 15 minutes: expiry should feel prompt without hammering the database.
    await this.lifecycle.add(
      JOB_EXPIRE_LISTINGS,
      {},
      { repeat: { pattern: '*/15 * * * *' }, jobId: 'repeat:expire-listings' },
    );

    // Daily at 09:00 IST — a reminder that arrives at 3am is a reminder nobody acts on.
    await this.lifecycle.add(
      JOB_WARN_EXPIRING,
      {},
      { repeat: { pattern: '0 9 * * *', tz: 'Asia/Kolkata' }, jobId: 'repeat:warn-expiring' },
    );

    // Nightly cleanup, off-peak.
    await this.lifecycle.add(
      JOB_SWEEP_ORPHAN_MEDIA,
      {},
      { repeat: { pattern: '0 3 * * *', tz: 'Asia/Kolkata' }, jobId: 'repeat:sweep-media' },
    );

    await this.lifecycle.add(
      JOB_SWEEP_SESSIONS,
      {},
      { repeat: { pattern: '30 3 * * *', tz: 'Asia/Kolkata' }, jobId: 'repeat:sweep-sessions' },
    );

    await this.lifecycle.add(
      JOB_TRIM_RECENTLY_VIEWED,
      {},
      {
        repeat: { pattern: '45 3 * * *', tz: 'Asia/Kolkata' },
        jobId: 'repeat:trim-recently-viewed',
      },
    );

    // Nightly consistency rebuild. This is what makes it safe for the index publisher to
    // swallow enqueue failures — anything missed during a Redis blip is repaired here.
    await this.search.add(
      JOB_REINDEX_ALL,
      { requestedBy: 'scheduler' },
      { repeat: { pattern: '0 4 * * *', tz: 'Asia/Kolkata' }, jobId: 'repeat:reindex-all' },
    );

    this.logger.log('Scheduled jobs registered');
  }
}
