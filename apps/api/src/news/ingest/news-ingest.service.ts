import { Injectable, Logger } from '@nestjs/common';
import { IngestionStatus, NewsArticleRole, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GazetteerService } from '../geo/gazetteer.service';
import { primaryPlace, resolvePlaces } from '../geo/location-resolver';
import { guessCategory, hash8, slugify } from '../feed/event-shaper';
import { parseFeed } from './rss.parser';

const USER_AGENT = 'LocZ/1.0 (https://locz.in; support@locz.in)';

/** One feed to ingest. */
export interface IngestTarget {
  feedId: string;
  sourceId: string;
  url: string;
  language: string;
}

export interface IngestResult {
  fetched: number;
  created: number;
  skipped: number;
  unresolved: number;
}

/**
 * RSS ingestion into the persistent store. For each feed item: resolve its place(s), then upsert
 * (idempotent) a RawNewsDocument + NewsArticle and — for the first pass — one NewsEvent per article
 * (geo point from the resolved locality; the trigger fills `geo`). Dedup/clustering into shared
 * events is a later slice; the schema already supports many articles per event.
 */
@Injectable()
export class NewsIngestService {
  private readonly logger = new Logger(NewsIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gazetteer: GazetteerService,
  ) {}

  async ingestFeed(target: IngestTarget, limit = 40): Promise<IngestResult> {
    const gaz = await this.gazetteer.get();
    let xml: string;
    try {
      const res = await fetch(target.url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { fetched: 0, created: 0, skipped: 0, unresolved: 0 };
      xml = await res.text();
    } catch (e) {
      this.logger.warn(`Fetch failed for ${target.url}: ${(e as Error).message}`);
      return { fetched: 0, created: 0, skipped: 0, unresolved: 0 };
    }

    const items = parseFeed(xml, limit);
    const result: IngestResult = { fetched: items.length, created: 0, skipped: 0, unresolved: 0 };

    for (const item of items) {
      // Idempotent: an article we already have (same canonical URL) is skipped without work.
      const exists = await this.prisma.newsArticle.findUnique({
        where: { canonicalUrl: item.link },
        select: { id: true },
      });
      if (exists) {
        result.skipped += 1;
        continue;
      }

      const place = primaryPlace(resolvePlaces(`${item.title} ${item.summary ?? ''}`, gaz));
      if (!place) {
        result.unresolved += 1;
        continue; // stored for reprocessing later once the alias graph improves — kept simple here
      }

      const contentHash = createHash('sha256')
        .update(`${item.title}\n${item.summary ?? ''}`)
        .digest('hex');
      const category = guessCategory(`${item.title} ${item.summary ?? ''}`);
      const slug = slugify(item.title, item.guid) || `news-${hash8(item.link)}`;

      try {
        await this.prisma.$transaction(async (tx) => {
          const raw = await tx.rawNewsDocument.upsert({
            where: { feedId_externalId: { feedId: target.feedId, externalId: item.guid } },
            create: {
              feedId: target.feedId,
              externalId: item.guid,
              contentHash,
              rawPayload: item as unknown as Prisma.InputJsonValue,
              status: IngestionStatus.PROCESSED,
            },
            update: {},
          });

          const article = await tx.newsArticle.create({
            data: {
              sourceId: target.sourceId,
              rawDocId: raw.id,
              title: item.title,
              summary: item.summary,
              language: target.language,
              canonicalUrl: item.link,
              sourceUrl: item.link,
              publisher: item.source,
              imageUrl: item.imageUrl,
              category,
              publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            },
          });

          const event = await tx.newsEvent.create({
            data: {
              slug,
              title: item.title,
              summary: item.summary,
              categories: [category],
              latitude: new Prisma.Decimal(place.lat),
              longitude: new Prisma.Decimal(place.lng),
              latestUpdateAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
              firstSeenAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
              sourceCount: 1,
            },
          });

          await tx.newsEventArticle.create({
            data: { eventId: event.id, articleId: article.id, role: NewsArticleRole.PRIMARY },
          });
          await tx.newsEventLocation.create({
            data: {
              eventId: event.id,
              entityType: place.entityType,
              entityId: place.entityId,
              confidence: place.confidence,
            },
          });
        });
        result.created += 1;
      } catch (e) {
        // Unique-constraint races (slug/canonicalUrl) just mean someone else ingested it — skip.
        this.logger.debug(`Skip "${item.title.slice(0, 40)}": ${(e as Error).message}`);
        result.skipped += 1;
      }
    }

    await this.prisma.newsFeed.update({
      where: { id: target.feedId },
      data: { lastFetchAt: new Date() },
    });
    this.logger.log(
      `Ingested ${target.url}: fetched ${result.fetched}, created ${result.created}, ` +
        `skipped ${result.skipped}, unresolved ${result.unresolved}`,
    );
    return result;
  }
}
