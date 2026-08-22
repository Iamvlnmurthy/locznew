import { Injectable } from '@nestjs/common';
import { NewsSourceType, SourceHealth } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { IngestTarget } from '../ingest/news-ingest.service';

/** Google News RSS search URL for an area + language (keyless, India-localised, syndication feed). */
export function googleNewsUrl(query: string, language: string): string {
  const hl = `${language}-IN`;
  const ceid = `IN:${language}`;
  return (
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(query) +
    `&hl=${hl}&gl=IN&ceid=${ceid}`
  );
}

/**
 * News source registry. Minimal for the first live slice: register a Google News feed per
 * (area, language) idempotently and hand back an ingest target. Publisher feeds and the licence
 * gate layer on later; Google News is keyless + display-only so it needs no storage licence.
 */
@Injectable()
export class NewsSourceService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureGoogleSource(): Promise<string> {
    const source = await this.prisma.newsSource.upsert({
      where: { key: 'google-news' },
      create: {
        key: 'google-news',
        name: 'Google News',
        domain: 'news.google.com',
        sourceType: NewsSourceType.RSS,
        language: 'en',
        crawlAllowed: true,
        crawlIntervalSec: 300,
        status: SourceHealth.HEALTHY,
      },
      update: { status: SourceHealth.HEALTHY },
      select: { id: true },
    });
    return source.id;
  }

  /** Register (idempotently) a Google News feed for an area + language; returns the ingest target. */
  async ensureGoogleNewsFeed(query: string, language: string): Promise<IngestTarget> {
    const sourceId = await this.ensureGoogleSource();
    const url = googleNewsUrl(query, language);
    const feed = await this.prisma.newsFeed.upsert({
      where: { sourceId_url: { sourceId, url } },
      create: { sourceId, url, feedType: NewsSourceType.RSS, language, active: true },
      update: { active: true },
      select: { id: true },
    });
    return { feedId: feed.id, sourceId, url, language };
  }

  /** Active feeds due for a fetch (nextFetchAt null or in the past), oldest first. */
  async listDueFeeds(limit = 50): Promise<IngestTarget[]> {
    const feeds = await this.prisma.newsFeed.findMany({
      where: { active: true, OR: [{ nextFetchAt: null }, { nextFetchAt: { lte: new Date() } }] },
      orderBy: { lastFetchAt: 'asc' },
      take: limit,
      select: { id: true, sourceId: true, url: true, language: true },
    });
    return feeds.map((f) => ({
      feedId: f.id,
      sourceId: f.sourceId,
      url: f.url,
      language: f.language ?? 'en',
    }));
  }
}
