import { KeywordTranslationsService } from '../src/businesses/keyword-translations.service';

/**
 * The terms inside a composed description, in the reader's language.
 *
 * These cases are mostly about what happens when the vocabulary is missing, stale or still
 * loading, because that is the ordinary case rather than the exception: a keyword a shop
 * typed itself will never be in the table, and the page must still render.
 */
describe('keyword translations', () => {
  function build(rows: Array<{ term: string; nameTe: string | null; nameHi: string | null }>) {
    const prisma = { keywordTranslation: { findMany: jest.fn().mockResolvedValue(rows) } };
    return { service: new KeywordTranslationsService(prisma as never), prisma };
  }

  const rows = [
    { term: 'dental clinic', nameTe: 'దంత క్లినిక్', nameHi: 'दंत क्लिनिक' },
    { term: 'school', nameTe: 'పాఠశాల', nameHi: null },
  ];

  it('leaves English alone without even reading the table', async () => {
    const { service, prisma } = build(rows);

    expect(service.localize(['dental clinic'], 'en')).toEqual(['dental clinic']);
    expect(service.localize(['dental clinic'], undefined)).toEqual(['dental clinic']);
    expect(prisma.keywordTranslation.findMany).not.toHaveBeenCalled();
  });

  it('translates once the vocabulary is loaded', async () => {
    const { service } = build(rows);

    service.localize(['dental clinic'], 'te'); // triggers the load
    await new Promise(process.nextTick);

    expect(service.localize(['dental clinic'], 'te')).toEqual(['దంత క్లినిక్']);
    expect(service.localize(['dental clinic'], 'hi')).toEqual(['दंत क्लिनिक']);
  });

  it('keeps the English term when that language has no translation for it', async () => {
    const { service } = build(rows);
    service.localize(['school'], 'te');
    await new Promise(process.nextTick);

    // 'school' has Telugu but no Hindi. Showing the English word beats showing nothing.
    expect(service.localize(['school'], 'te')).toEqual(['పాఠశాల']);
    expect(service.localize(['school'], 'hi')).toEqual(['school']);
  });

  it('passes through a term nobody has translated, such as one a shop typed itself', async () => {
    const { service } = build(rows);
    service.localize(['x'], 'te');
    await new Promise(process.nextTick);

    expect(service.localize(['home made pickles'], 'te')).toEqual(['home made pickles']);
  });

  it('matches regardless of case and surrounding space', async () => {
    const { service } = build(rows);
    service.localize(['x'], 'te');
    await new Promise(process.nextTick);

    expect(service.localize([' Dental Clinic '], 'te')).toEqual(['దంత క్లినిక్']);
  });

  it('renders in English rather than failing when the table cannot be read', async () => {
    const prisma = {
      keywordTranslation: { findMany: jest.fn().mockRejectedValue(new Error('database down')) },
    };
    const service = new KeywordTranslationsService(prisma as never);

    service.localize(['dental clinic'], 'te');
    await new Promise(process.nextTick);

    // A business profile must not go down because a vocabulary lookup did.
    expect(service.localize(['dental clinic'], 'te')).toEqual(['dental clinic']);
  });

  it('collapses two terms that share one translation', async () => {
    // "grocery store" and "food and beverage store" are both కిరాణా దుకాణం. The description
    // joins these into a sentence, so keeping both reads as "people look here for X and X".
    const prisma = {
      keywordTranslation: {
        findMany: jest.fn().mockResolvedValue([
          { term: 'grocery store', nameTe: 'కిరాణా దుకాణం', nameHi: null },
          { term: 'food and beverage store', nameTe: 'కిరాణా దుకాణం', nameHi: null },
        ]),
      },
    };
    const service = new KeywordTranslationsService(prisma as never);
    service.localize(['x'], 'te');
    await new Promise(process.nextTick);

    expect(service.localize(['grocery store', 'food and beverage store'], 'te')).toEqual([
      'కిరాణా దుకాణం',
    ]);
  });

  it('does not read the table once per profile view', async () => {
    const { service, prisma } = build(rows);

    service.localize(['school'], 'te');
    await new Promise(process.nextTick);
    for (let i = 0; i < 50; i += 1) service.localize(['school'], 'te');
    await new Promise(process.nextTick);

    expect(prisma.keywordTranslation.findMany).toHaveBeenCalledTimes(1);
  });
});
