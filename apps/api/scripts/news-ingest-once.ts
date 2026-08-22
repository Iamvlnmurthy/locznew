/**
 * One-off ingestion probe: register a couple of Google News feeds for the launch region and ingest
 * them into the live DB, so we can verify the pipeline end-to-end (events land, /news/feed serves
 * them). Standalone — instantiates the services with a PrismaClient, no Nest boot.
 *
 *   set -a; source /home/locz/app/.env; set +a
 *   npx ts-node scripts/news-ingest-once.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { NewsSourceService } from '../src/news/sources/news-source.service';
import { GazetteerService } from '../src/news/geo/gazetteer.service';
import { NewsIngestService } from '../src/news/ingest/news-ingest.service';
import type { PrismaService } from '../src/prisma/prisma.service';

// Prisma 7 connects through a driver adapter (same as the app's PrismaService).
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const p = prisma as unknown as PrismaService;
const sources = new NewsSourceService(p);
const gaz = new GazetteerService(p);
const ingest = new NewsIngestService(p, gaz);

const FEEDS: Array<[string, string]> = [
  ['Hyderabad OR Gachibowli OR Madhapur OR Warangal OR Vijayawada', 'en'],
  ['హైదరాబాద్ OR గచ్చిబౌలి OR మాదాపూర్ OR వరంగల్', 'te'],
];

async function main() {
  for (const [area, language] of FEEDS) {
    const target = await sources.ensureGoogleNewsFeed(area, language);
    const result = await ingest.ingestFeed(target);
    console.log(`[${language}] ${area.slice(0, 40)} → ${JSON.stringify(result)}`);
  }
  const total = await prisma.newsEvent.count();
  console.log(`Total NewsEvent rows: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
