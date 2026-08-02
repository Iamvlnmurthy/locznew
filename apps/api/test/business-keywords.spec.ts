import { BadRequestException } from '@nestjs/common';
import { BusinessesService } from '../src/businesses/businesses.service';
import { MAX_BUSINESS_KEYWORDS } from '../src/businesses/dto/business.dto';

/**
 * What a business says it sells.
 *
 * Category vocabulary can only ever reach category level — it makes a kirana shop findable by
 * "kirana" and "grocery store", never by "toor dal", "weighing machine" or "bed bug spray".
 * Those are the searches people actually run, so the shop gets to say what is on its shelves.
 *
 * These terms go straight into the search index, which is why the cases below are mostly
 * about what may not go in one: an unchecked field here is a way to make a shop appear for
 * words the platform has decided nobody may advertise, arriving through a different door than
 * the listing rules guard.
 */
describe('business keywords', () => {
  /**
   * Only Prisma is reached by the code under test, so the remaining dependencies are left
   * undefined rather than mocked into existence — a stub that is never called is noise, and
   * one that quietly gets called would be a bug this hides.
   */
  const construct = (prisma: unknown): BusinessesService =>
    new (BusinessesService as unknown as new (prisma: unknown) => BusinessesService)(prisma);

  function build({ banned = [] as string[] } = {}) {
    const prisma = {
      bannedKeyword: {
        findMany: jest.fn().mockResolvedValue(banned.map((keyword) => ({ keyword }))),
      },
    };

    const service = construct(prisma);

    // The normaliser is private because nothing outside the service should be able to write
    // an unchecked term; the tests reach it directly rather than staging a whole create.
    return (keywords: string[]): Promise<string[]> =>
      (
        service as unknown as { normaliseKeywords(k: string[]): Promise<string[]> }
      ).normaliseKeywords(keywords);
  }

  it('lowercases and collapses spacing so one shelf is not two terms', async () => {
    const normalise = build();

    await expect(normalise(['Toor  Dal', '  ATTA '])).resolves.toEqual(['toor dal', 'atta']);
  });

  it('drops duplicates that differ only in case', async () => {
    const normalise = build();

    await expect(normalise(['Toor Dal', 'toor dal'])).resolves.toEqual(['toor dal']);
  });

  it('drops single characters', async () => {
    const normalise = build();

    // A one-letter term matches almost everything and describes nothing.
    await expect(normalise(['a', 'x', 'atta'])).resolves.toEqual(['atta']);
  });

  it('refuses a term the platform bans, and names it', async () => {
    const normalise = build({ banned: ['escort service'] });

    // Silently dropping it would leave the owner believing the term is live. Worse, it would
    // hide that the platform noticed.
    await expect(normalise(['atta', 'escort service'])).rejects.toThrow(BadRequestException);
    await expect(normalise(['escort service'])).rejects.toThrow(/escort service/);
  });

  it('catches a banned term inside a longer phrase', async () => {
    const normalise = build({ banned: ['ganja'] });

    await expect(normalise(['ganja home delivery'])).rejects.toThrow(BadRequestException);
  });

  it('caps the list rather than letting a shop bid for every query', async () => {
    const normalise = build();

    const many = Array.from({ length: MAX_BUSINESS_KEYWORDS + 20 }, (_, i) => `item ${i}`);

    await expect(normalise(many)).resolves.toHaveLength(MAX_BUSINESS_KEYWORDS);
  });

  it('does not query the banned list when there is nothing to check', async () => {
    const prisma = {
      bannedKeyword: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = construct(prisma);

    await (
      service as unknown as { normaliseKeywords(k: string[]): Promise<string[]> }
    ).normaliseKeywords([]);

    expect(prisma.bannedKeyword.findMany).not.toHaveBeenCalled();
  });
});
