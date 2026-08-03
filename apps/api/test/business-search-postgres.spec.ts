import { BusinessSearchService } from '../src/search/business-search.service';

/**
 * Business search after it moved off Meilisearch.
 *
 * The behaviour worth pinning down is not "does it return rows" — that needs a database
 * and 3.4 million businesses, and is verified against the real one. It is the branching
 * around the query: when the expensive fuzzy fallback is allowed to run, and that a
 * filter-only browse never pays for it.
 */
describe('BusinessSearchService on Postgres', () => {
  function build(strictRows: Array<{ id: string; total: bigint }>) {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce(strictRows)
      .mockResolvedValue([{ id: 'fuzzy-1', total: 1n }]);
    const prisma = { $queryRaw: queryRaw, business: { count: jest.fn().mockResolvedValue(7) } };
    return { service: new BusinessSearchService(prisma as never), queryRaw };
  }

  const base = { page: 1, limit: 20 };

  it('returns strict matches without paying for the fuzzy path', async () => {
    const { service, queryRaw } = build([{ id: 'b1', total: 3n }]);

    const result = await service.search({ ...base, query: 'medical' });

    expect(result).toEqual({ ids: ['b1'], total: 3 });
    // One query, not two. The trigram scan cannot use the tsvector index, so it must never
    // run on the common path.
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('falls back to fuzzy only when the strict query found nothing', async () => {
    const { service, queryRaw } = build([]);

    const result = await service.search({ ...base, query: 'medicl' });

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(result.ids).toEqual(['fuzzy-1']);
  });

  it('does not chase a typo on a short word', async () => {
    const { service, queryRaw } = build([]);

    const result = await service.search({ ...base, query: 'abc' });

    // Three letters are too few for similarity to mean anything; it would match noise.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ids: [], total: 0 });
  });

  it('browses on filters alone without a fuzzy pass', async () => {
    const { service, queryRaw } = build([]);

    const result = await service.search({ ...base, query: '', categoryId: 'cat-1' });

    // An empty query with a category filter is a browse. There is no spelling to forgive.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(0);
  });

  // ---------------------------------------------------------------- drift is now impossible
  describe('the methods that used to maintain an index', () => {
    it('reports every active business as searchable', async () => {
      const { service } = build([]);

      await expect(service.status()).resolves.toEqual({
        available: true,
        indexedDocuments: 7,
        businesses: 7,
      });
    });

    it('cannot report drift, because the document is the row', async () => {
      const { service } = build([]);

      const status = await service.status();

      // The failure this replaces: 400 documents indexed against 3.4 million businesses,
      // reported as healthy. That gap is no longer expressible.
      expect(status.indexedDocuments).toBe(status.businesses);
    });

    it('indexing a single business is a no-op rather than a queued job', async () => {
      const { service, queryRaw } = build([]);

      await expect(service.indexBusiness('b1')).resolves.toBeUndefined();
      await expect(service.removeBusiness('b1')).resolves.toBeUndefined();
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });
});
