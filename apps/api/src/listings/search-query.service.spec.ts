import { Logger } from '@nestjs/common';
import { SearchQueryService } from './search-query.service';
import { SearchQueryDto } from '../search/dto/search.dto';

/**
 * What happens to a search when Meilisearch is unavailable.
 *
 * This path had no test at all, which is how it came to silently drop the keyword: the
 * fallback built a *browse* query and never copied `q` into it, so an outage answered
 * "car" with the entire published catalogue and reported it as results. Nothing failed,
 * nothing logged an error, and the only clue was `usedSearchIndex: false`.
 *
 * A degraded search may return fewer results than a healthy one. It may not return wrong
 * ones, and returning everything in response to a specific word is the most wrong answer
 * available.
 */
describe('SearchQueryService, when the search index is unavailable', () => {
  let service: SearchQueryService;
  let meili: { searchListings: jest.Mock };
  let listings: { search: jest.Mock; findSummariesByIds: jest.Mock };
  let prisma: { pincode: { findUnique: jest.Mock } };

  const browseResult = {
    items: [{ id: 'listing-1' }],
    meta: { total: 1, page: 1, limit: 20 },
  };

  function query(overrides: Partial<SearchQueryDto> = {}): SearchQueryDto {
    return Object.assign(new SearchQueryDto(), { page: 1, limit: 20, ...overrides });
  }

  /** The browse query the fallback handed to the database. */
  function browseQuery(): { q?: string; priceMax?: number; type?: string } {
    const calls = listings.search.mock.calls as Array<
      [{ q?: string; priceMax?: number; type?: string }]
    >;
    return calls[0]?.[0] ?? {};
  }

  /** The keyword the fallback handed to the database, or undefined if it dropped it. */
  function keywordPassedToDatabase(): string | undefined {
    return browseQuery().q;
  }

  beforeEach(() => {
    // The fallback logs an error by design; silencing it keeps the run readable.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    meili = { searchListings: jest.fn() };
    listings = { search: jest.fn().mockResolvedValue(browseResult), findSummariesByIds: jest.fn() };
    prisma = { pincode: { findUnique: jest.fn() } };

    service = new SearchQueryService(
      meili as never,
      prisma as never,
      listings as never,
      // Search learning: records what was typed and whether it found anything. Not what
      // these cases are about, so it is a stub.
      { record: jest.fn() } as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('still applies the keyword instead of returning the whole catalogue', async () => {
    meili.searchListings.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await service.search(query({ q: 'car' }));

    expect(listings.search).toHaveBeenCalledTimes(1);
    expect(keywordPassedToDatabase()).toBe('car');
    expect(result.usedSearchIndex).toBe(false);
  });

  it('does not fail the request when the index is down', async () => {
    meili.searchListings.mockRejectedValue(new Error('connect ECONNREFUSED'));

    // Availability is the point of the fallback: someone trying to buy a fridge should get
    // results, not a 500, and the flag tells the caller which path served them.
    await expect(service.search(query({ q: 'fridge' }))).resolves.toMatchObject({
      usedSearchIndex: false,
      total: 1,
    });
  });

  it('trims the keyword rather than searching for whitespace', async () => {
    meili.searchListings.mockRejectedValue(new Error('down'));

    await service.search(query({ q: '  car  ' }));

    expect(keywordPassedToDatabase()).toBe('car');
  });

  it('carries the other filters through unchanged', async () => {
    meili.searchListings.mockRejectedValue(new Error('down'));

    await service.search(query({ q: 'car', priceMax: 5000, type: 'PRODUCT' as never }));

    // A dropped price ceiling during an outage is the same class of defect as a dropped
    // keyword — quietly wider results that look authoritative.
    expect(browseQuery()).toMatchObject({ priceMax: 5000, type: 'PRODUCT' });
  });

  it('does not apply the database keyword when the index is healthy', async () => {
    meili.searchListings.mockResolvedValue({ ids: [], total: 0, documents: [] });

    const result = await service.search(query({ q: 'car' }));

    // Meilisearch has already matched; narrowing again with the database's stricter rule
    // would hide results it correctly found.
    expect(listings.search).not.toHaveBeenCalled();
    expect(result.usedSearchIndex).toBe(true);
  });

  it('goes straight to the database when there is no keyword at all', async () => {
    const result = await service.search(query({ q: '   ' }));

    expect(meili.searchListings).not.toHaveBeenCalled();
    expect(keywordPassedToDatabase()).toBeUndefined();
    expect(result.usedSearchIndex).toBe(false);
  });
});

/**
 * Precise filters on the keyword-search endpoint.
 *
 * `/search` and `/listings` describe the same question with two DTOs, and the filters were
 * added to one of them. Every attribute filter posted to `/search` came back "property attr
 * should not exist", so the search page could offer a filter panel the search endpoint
 * refused.
 */
describe('SearchQueryService precise filters', () => {
  function build() {
    const listings = {
      search: jest
        .fn()
        .mockResolvedValue({ items: [], meta: { total: 0, page: 1, limit: 20 } }),
      findSummariesByIds: jest.fn().mockResolvedValue([]),
    };
    const meili = { searchListings: jest.fn().mockResolvedValue({ ids: [], total: 0 }) };
    const prisma = { pincode: { findUnique: jest.fn().mockResolvedValue(null) } };

    // Constructor order is (meili, prisma, listings) — matching the block above.
    const service = new SearchQueryService(
      meili as never,
      prisma as never,
      listings as never,
      // Search learning: records what was typed and whether it found anything. Not what
      // these cases are about, so it is a stub.
      { record: jest.fn() } as never,
    );
    return { service, listings, meili };
  }

  it('answers an attribute-filtered keyword search from the database', async () => {
    const { service, listings, meili } = build();

    await service.search({ q: 'swift', attr: ['fuel_type:PETROL'], page: 1, limit: 20 } as never);

    // Attributes are not in the indexed document, so Meilisearch would return petrol and
    // diesel alike for a query filtered to petrol.
    expect(meili.searchListings).not.toHaveBeenCalled();
    expect(listings.search).toHaveBeenCalledWith(
      expect.objectContaining({ attr: ['fuel_type:PETROL'], q: 'swift' }),
      undefined,
    );
  });

  it('keeps using the index when only the keyword is given', async () => {
    const { service, meili } = build();

    await service.search({ q: 'swift', page: 1, limit: 20 } as never);

    expect(meili.searchListings).toHaveBeenCalled();
  });

  it('carries the typed detail filters through to the database', async () => {
    const { service, listings } = build();

    await service.search({ brand: 'Maruti Suzuki', bedroomsMin: 2, page: 1, limit: 20 } as never);

    expect(listings.search).toHaveBeenCalledWith(
      expect.objectContaining({ brand: 'Maruti Suzuki', bedroomsMin: 2 }),
      undefined,
    );
  });
});
