/**
 * Pushes the current index settings to Meilisearch, without rebuilding.
 *
 * Settings and documents are separate concerns: adding a searchable attribute changes how
 * queries are answered but not what is stored, so a full rebuild of four million businesses
 * to publish a one-line settings change would be enormous waste. This applies the settings
 * and stops.
 *
 * Run after any change to searchableAttributes, stop words, ranking rules or typo tolerance.
 * Safe to run repeatedly — Meilisearch treats settings as a declaration, not a diff.
 *
 *   npx ts-node scripts/configure-search-indexes.ts
 *
 * ts-node rather than tsx: anything that boots Nest needs emitted decorator metadata, and
 * esbuild does not produce it.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BusinessSearchService } from '../src/search/business-search.service';
import { SearchService } from '../src/search/search.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    await app.get(SearchService).configureIndex();
    console.log('Listing index settings applied.');

    await app.get(BusinessSearchService).configureIndex();
    console.log('Business index settings applied.');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
