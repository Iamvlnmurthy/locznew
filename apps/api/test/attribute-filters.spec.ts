import { Prisma } from '@prisma/client';
import { ListingsService } from '../src/listings/listings.service';
import { ListingSearchQueryDto } from '../src/listings/dto/listing.dto';

/**
 * Filtering a browse query by category attribute.
 *
 * `whereFor` and `attributeFilters` are private because every browse path is meant to go
 * through them rather than build its own conditions — the comment on `whereFor` records what
 * happened last time there were two dialects of the same rule. These tests reach in on
 * purpose: the alternative is asserting through a mocked Prisma two layers away, where a
 * clobbered `AND` key looks identical to a filter that was never applied.
 */
describe('attribute filters', () => {
  const service = Object.create(ListingsService.prototype) as ListingsService;

  const filtersFor = (specs?: string[]): Prisma.ListingWhereInput[] =>
    (
      service as unknown as {
        attributeFilters(specs?: string[]): Prisma.ListingWhereInput[];
      }
    ).attributeFilters(specs);

  const whereFor = (query: Partial<ListingSearchQueryDto>): Prisma.ListingWhereInput =>
    (
      service as unknown as {
        whereFor(query: ListingSearchQueryDto): Prisma.ListingWhereInput;
      }
    ).whereFor(query as ListingSearchQueryDto);

  it('matches an exact value regardless of case', () => {
    const [filter] = filtersFor(['fuel_type:petrol']);

    expect(filter).toEqual({
      attributeValues: {
        some: {
          attribute: { key: 'fuel_type' },
          OR: [{ valueText: { equals: 'petrol', mode: 'insensitive' } }],
        },
      },
    });
  });

  it('matches a number against both the text and the number column', () => {
    const filter = filtersFor(['bedrooms:3'])[0]!;
    const or = (filter.attributeValues as { some: { OR: unknown[] } }).some.OR;

    // Which column holds the value depends on the attribute's declared data type, and this
    // builder stays synchronous rather than looking that up — so it offers both. The key
    // already restricts the row to one attribute, so there is nothing else to collide with.
    expect(or).toHaveLength(2);
    expect(or).toContainEqual({ valueNumber: new Prisma.Decimal(3) });
  });

  it('reads min..max as a range, with either side optional', () => {
    const [bounded] = filtersFor(['km_driven:10000..50000']);
    expect(bounded).toEqual({
      attributeValues: {
        some: {
          attribute: { key: 'km_driven' },
          valueNumber: { gte: new Prisma.Decimal(10000), lte: new Prisma.Decimal(50000) },
        },
      },
    });

    const openEnded = filtersFor(['km_driven:..50000'])[0]!;
    const bounds = (openEnded.attributeValues as { some: { valueNumber: object } }).some.valueNumber;
    expect(bounds).toEqual({ lte: new Prisma.Decimal(50000) });
  });

  it('gives every filter its own `some`', () => {
    const filters = filtersFor(['fuel_type:PETROL', 'km_driven:..50000']);

    // One `some` carrying both conditions would ask for a single attribute row that is
    // simultaneously the fuel type and the distance driven. No such row exists, so picking a
    // second filter would empty the page.
    expect(filters).toHaveLength(2);
  });

  it('ignores a malformed filter rather than guessing at it', () => {
    expect(filtersFor(['nocolon', ':novalue', 'key:'])).toEqual([]);
  });

  it('keeps a keyword and an attribute filter together', () => {
    const where = whereFor({ q: 'swift', attr: ['fuel_type:PETROL'] });

    // Both live under one `AND`. Two spread entries each writing `AND` would leave only the
    // last, and searching with a filter set would silently drop one of the two — which is
    // indistinguishable, from the outside, from the filter simply not working.
    expect(where.AND).toHaveLength(2);
  });

  it('leaves the category `OR` alone when filtering by attribute', () => {
    const where = whereFor({ categoryId: 'category-1', attr: ['fuel_type:PETROL'] });

    expect(where.OR).toEqual([{ categoryId: 'category-1' }, { subcategoryId: 'category-1' }]);
    expect(where.AND).toHaveLength(1);
  });

  it('adds nothing when no attribute filter was asked for', () => {
    expect(whereFor({}).AND).toBeUndefined();
  });
});
