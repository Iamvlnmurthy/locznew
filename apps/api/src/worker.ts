import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module';

/**
 * Background worker entrypoint.
 *
 * Same image and same module graph as the API, started without an HTTP server: the
 * BullMQ processors are ordinary providers, so creating the application context is all
 * that is needed to start consuming. Running workers in their own process keeps a slow
 * image conversion or a stalled FCM call from competing with request handling.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();

  const logger = new Logger('Worker');
  logger.log('LocZ worker started — consuming search, notification and lifecycle queues');

  // Shutdown hooks close the BullMQ workers so in-flight jobs finish rather than being
  // abandoned mid-run on a deploy.
  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
