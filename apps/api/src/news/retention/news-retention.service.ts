import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Deletes news past its usefulness so the news tables do not grow without bound.
 *
 * Ingestion runs every five minutes forever, and the feed only ever shows a 7-day window — so
 * without this every `NewsEvent`, `NewsArticle` and `RawNewsDocument` ever ingested would sit in
 * the database for good, invisible and accumulating. This is the "auto-delete after the retention
 * window" the architecture doc planned.
 *
 * Retention is deliberately wider than the feed window (default 14 days vs the feed's 7): an event
 * that just dropped off the feed is not deleted the same hour, which leaves a margin for a late
 * viewer, a slug still being crawled, or the window being widened later.
 */
@Injectable()
export class NewsRetentionService {
  private readonly logger = new Logger(NewsRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private retentionDays(): number {
    const raw = Number(this.config.get('NEWS_RETENTION_DAYS'));
    return Number.isFinite(raw) && raw > 0 ? raw : 14;
  }

  /**
   * Delete everything older than the retention window.
   *
   * Order matters. Deleting an event cascades the event↔article join rows (schema), so after the
   * events are gone the old articles are orphaned and can be removed, and then the raw documents
   * that no longer back an article. Each step is filtered on age too, so an old article still
   * attached to a live (recently-updated) event is never removed — which is what keeps a clustered
   * event that stays active from losing its early sources.
   */
  async purgeExpired(days = this.retentionDays()): Promise<{
    events: number;
    articles: number;
    rawDocs: number;
  }> {
    const cutoff = new Date(Date.now() - days * 24 * 3_600_000);

    const events = await this.prisma.newsEvent.deleteMany({
      where: { latestUpdateAt: { lt: cutoff } },
    });
    const articles = await this.prisma.newsArticle.deleteMany({
      where: { createdAt: { lt: cutoff }, events: { none: {} } },
    });
    const rawDocs = await this.prisma.rawNewsDocument.deleteMany({
      where: { createdAt: { lt: cutoff }, article: { is: null } },
    });

    if (events.count || articles.count || rawDocs.count) {
      this.logger.log(
        `News retention (${days}d): removed ${events.count} events, ${articles.count} orphan ` +
          `articles, ${rawDocs.count} orphan raw documents`,
      );
    }
    return { events: events.count, articles: articles.count, rawDocs: rawDocs.count };
  }
}
