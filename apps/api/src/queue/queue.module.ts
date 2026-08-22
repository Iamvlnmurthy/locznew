import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import {
  QUEUE_LIFECYCLE,
  QUEUE_NEWS,
  QUEUE_NOTIFICATIONS,
  QUEUE_REQUIREMENTS,
  QUEUE_SAVED_SEARCHES,
  QUEUE_SEARCH,
} from './queue.constants';

/**
 * BullMQ wiring. Defaults are set once here so no producer has to remember them:
 *
 *  - exponential backoff with 5 attempts: a Meilisearch or FCM blip should not lose work
 *  - completed jobs are trimmed aggressively, failed jobs are kept for a week so a
 *    failure is still diagnosable on Monday morning
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        connection: {
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
          password: config.get('REDIS_PASSWORD') || undefined,
        },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 200, age: 3600 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_SEARCH },
      { name: QUEUE_NOTIFICATIONS },
      { name: QUEUE_LIFECYCLE },
      { name: QUEUE_SAVED_SEARCHES },
      { name: QUEUE_REQUIREMENTS },
      { name: QUEUE_NEWS },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
