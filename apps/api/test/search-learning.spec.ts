import { SearchLearningService } from '../src/search/search-learning.service';

/**
 * Learning the vocabulary from what people type.
 *
 * Two things decide whether this is safe to build: it must never record a prohibited search,
 * and it must never record who searched. The first would put banned words in a report
 * somebody reads and might act on; the second creates a history of what individuals were
 * looking for, which has no product value and every liability.
 */
describe('SearchLearningService', () => {
  function build({ banned = ['ganja', 'escort service'] } = {}) {
    const prisma = {
      bannedKeyword: {
        findMany: jest.fn().mockResolvedValue(banned.map((keyword) => ({ keyword }))),
      },
      searchQueryLog: {
        create: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    return { service: new SearchLearningService(prisma as never), prisma };
  }

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  describe('what it refuses to record', () => {
    it('never records a prohibited search', async () => {
      const { service, prisma } = build();
      await service.onModuleInit();

      service.record({ query: 'ganja', resultCount: 0 });
      await flush();

      // Storing it would put a banned word in front of whoever reads the report, where
      // somebody could reasonably add it to the search terms — tuning the product for
      // exactly the content it refuses to host.
      expect(prisma.searchQueryLog.create).not.toHaveBeenCalled();
    });

    it('catches a prohibited phrase inside a longer query', async () => {
      const { service, prisma } = build();
      await service.onModuleInit();

      service.record({ query: 'escort service near madhapur', resultCount: 0 });
      await flush();

      expect(prisma.searchQueryLog.create).not.toHaveBeenCalled();
    });

    it('keeps the cached list when the refresh fails', async () => {
      const { service, prisma } = build();
      await service.onModuleInit();
      prisma.bannedKeyword.findMany.mockRejectedValue(new Error('database down'));

      service.record({ query: 'ganja', resultCount: 0 });
      await flush();

      // Failing open would start recording prohibited searches, which is the one outcome
      // this check exists to prevent.
      expect(prisma.searchQueryLog.create).not.toHaveBeenCalled();
    });

    it('ignores a query too short or too long to be a search', async () => {
      const { service, prisma } = build();
      await service.onModuleInit();

      service.record({ query: 'a', resultCount: 0 });
      service.record({ query: 'x'.repeat(200), resultCount: 0 });
      await flush();

      expect(prisma.searchQueryLog.create).not.toHaveBeenCalled();
    });
  });

  describe('what it does record', () => {
    it('records an ordinary search, normalised', async () => {
      const { service, prisma } = build();
      await service.onModuleInit();

      service.record({ query: '  Best Biryani?  ', resultCount: 0, cityId: 'city-1' });
      await flush();

      // Grouping only works if "Best Biryani", "best biryani " and "best biryani?" count as
      // the same thing.
      expect(prisma.searchQueryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            normalisedQuery: 'best biryani',
            isZeroResult: true,
            cityId: 'city-1',
          }),
        }),
      );
    });

    it('never records who searched', async () => {
      const { service, prisma } = build();
      await service.onModuleInit();

      service.record({ query: 'toor dal', resultCount: 0 });
      await flush();

      const data = prisma.searchQueryLog.create.mock.calls[0][0].data as Record<string, unknown>;
      // Knowing that a word was searched improves the platform. Knowing who searched it is a
      // record of what individuals were looking for.
      expect(Object.keys(data)).not.toContain('userId');
      expect(Object.keys(data)).not.toContain('deviceId');
      expect(Object.keys(data)).not.toContain('ip');
    });

    it('marks a search that found results as not zero-result', async () => {
      const { service, prisma } = build();
      await service.onModuleInit();

      service.record({ query: 'biryani', resultCount: 7 });
      await flush();

      expect(prisma.searchQueryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isZeroResult: false }) }),
      );
    });

    it('does not let a logging failure surface to the caller', async () => {
      const { service, prisma } = build();
      await service.onModuleInit();
      prisma.searchQueryLog.create.mockRejectedValue(new Error('database down'));

      // A search that worked for the user must not fail because recording it did not.
      expect(() => service.record({ query: 'biryani', resultCount: 3 })).not.toThrow();
      await flush();
    });
  });

  describe('the report', () => {
    it('excludes filtered searches from missing vocabulary', async () => {
      const { service, prisma } = build();

      await service.missingVocabulary({ cityId: 'city-1' });

      // A zero-result search with filters set is over-narrowing, not a missing word. Mixing
      // them in would send somebody off adding vocabulary that already exists.
      expect(prisma.searchQueryLog.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isZeroResult: true, hadFilters: false }),
        }),
      );
    });
  });
});
