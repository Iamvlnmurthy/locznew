import { AppConfig } from '../src/config/config.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NewsRetentionService } from '../src/news/retention/news-retention.service';

/**
 * News ingests every five minutes forever and the feed only shows 7 days, so without a purge the
 * tables grow without bound. The purge must delete by age and, crucially, only remove articles /
 * raw documents that are no longer attached to anything — an old article under a still-live
 * clustered event must survive.
 */
describe('NewsRetentionService.purgeExpired', () => {
  it('deletes events by age, then only orphaned old articles and raw documents', async () => {
    const newsEvent = { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) };
    const newsArticle = { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) };
    const rawNewsDocument = { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) };
    const prisma = { newsEvent, newsArticle, rawNewsDocument } as unknown as PrismaService;
    const config = { get: jest.fn().mockReturnValue(14) } as unknown as AppConfig;

    const service = new NewsRetentionService(prisma, config);
    const result = await service.purgeExpired();

    expect(result).toEqual({ events: 4, articles: 3, rawDocs: 2 });

    // events: purely by age
    expect(newsEvent.deleteMany.mock.calls[0][0].where.latestUpdateAt.lt).toBeInstanceOf(Date);
    // articles: old AND no longer linked to any event
    expect(newsArticle.deleteMany.mock.calls[0][0].where).toMatchObject({ events: { none: {} } });
    // raw docs: old AND no longer backing an article
    expect(rawNewsDocument.deleteMany.mock.calls[0][0].where).toMatchObject({
      article: { is: null },
    });
  });

  it('honours an explicit retention window over the configured default', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      newsEvent: { deleteMany },
      newsArticle: { deleteMany },
      rawNewsDocument: { deleteMany },
    } as unknown as PrismaService;
    const config = { get: jest.fn().mockReturnValue(14) } as unknown as AppConfig;

    const service = new NewsRetentionService(prisma, config);
    const before = Date.now();
    await service.purgeExpired(2); // 2-day window, not the configured 14
    const cutoff: Date = deleteMany.mock.calls[0][0].where.latestUpdateAt.lt;

    const days = (before - cutoff.getTime()) / (24 * 3_600_000);
    expect(days).toBeCloseTo(2, 1);
    expect(config.get).not.toHaveBeenCalled(); // explicit arg means the config isn't consulted
  });
});
