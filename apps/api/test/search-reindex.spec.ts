import type { EnqueuedTaskPromise } from 'meilisearch';
import { SearchService, type ListingDocument } from '../src/search/search.service';

function task(status: 'succeeded' | 'failed' = 'succeeded'): EnqueuedTaskPromise {
  return {
    waitTask: jest.fn().mockResolvedValue({
      status,
      ...(status === 'failed' ? { error: { message: 'test task failure' } } : {}),
    }),
  } as unknown as EnqueuedTaskPromise;
}

function makeService() {
  const prisma = {
    listing: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'live-listing' }])
        .mockResolvedValueOnce([]),
    },
  };
  const replacement = { addDocuments: jest.fn().mockReturnValue(task()) };
  const client = {
    createIndex: jest.fn().mockReturnValue(task()),
    index: jest.fn().mockReturnValue(replacement),
    swapIndexes: jest.fn().mockReturnValue(task()),
    deleteIndex: jest.fn().mockReturnValue(task()),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'MEILI_LISTINGS_INDEX') return 'listings';
      if (key === 'MEILI_HOST') return 'http://search.test';
      return '';
    }),
  };
  const service = new SearchService(config as never, prisma as never, {} as never);

  Object.defineProperty(service, 'client', { value: client });
  jest.spyOn(service, 'configureIndex').mockResolvedValue();
  jest.spyOn(service, 'buildDocument').mockResolvedValue({ id: 'live-listing' } as ListingDocument);

  return { service, client, replacement };
}

describe('search index rebuild', () => {
  it('replaces the live index so documents absent from PostgreSQL cannot survive', async () => {
    const { service, client, replacement } = makeService();

    await expect(service.reindexAll(1)).resolves.toEqual({ indexed: 1 });

    const replacementName = client.createIndex.mock.calls[0]?.[0] as string;
    expect(replacementName).toMatch(/^listings_rebuild_\d+$/);
    expect(replacement.addDocuments).toHaveBeenCalledWith([{ id: 'live-listing' }]);
    expect(client.swapIndexes).toHaveBeenCalledWith([
      { indexes: ['listings', replacementName], rename: false },
    ]);
    expect(client.deleteIndex).toHaveBeenCalledWith(replacementName);
  });

  it('does not activate a replacement when indexing fails', async () => {
    const { service, client, replacement } = makeService();
    replacement.addDocuments.mockReturnValue(task('failed'));

    await expect(service.reindexAll(1)).rejects.toThrow(
      'populate replacement search index failed: test task failure',
    );

    expect(client.swapIndexes).not.toHaveBeenCalled();
    expect(client.deleteIndex).toHaveBeenCalledTimes(1);
  });
});
