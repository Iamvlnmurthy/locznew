import { attributionFor, describeBusiness } from '../src/businesses/business-description';

/**
 * Describing a business that never described itself.
 *
 * Four million imported records have a name, a category and a location and nothing else. The
 * tempting fix is generated prose in the shop's voice, and it is the wrong one: that is a
 * claim about a real, named business, published where they cannot correct it. These cases pin
 * the two properties that make the alternative safe — every line comes from data we hold, and
 * an owner's own words always win.
 */
describe('describeBusiness', () => {
  const imported = {
    categoryName: 'Kirana store',
    localityName: 'Madhapur',
    cityName: 'Hyderabad',
    keywords: ['toor dal', 'atta', 'cooking oil'],
  };

  it('places the business without inventing anything about it', () => {
    const { text, generated } = describeBusiness(imported);

    expect(text).toContain('Kirana store in Madhapur, Hyderabad.');
    expect(generated).toBe(true);
  });

  it('hedges what people look for rather than claiming the shop stocks it', () => {
    const { text } = describeBusiness(imported);

    // The terms come from category vocabulary and from what people search, not from the shop
    // confirming anything. "Sells" would be a claim; "people look here for" is a fact.
    expect(text).toContain('People look here for toor dal, atta and cooking oil.');
    expect(text).not.toMatch(/\bsells\b|\bstocks\b|\boffers\b/i);
  });

  it("never writes over the owner's own words", () => {
    const { text, generated } = describeBusiness({
      ...imported,
      description: 'We have been on this corner since 1998.',
    });

    // A claimed business speaks for itself. Generated text sitting on top of what somebody
    // actually wrote is the failure this whole approach exists to avoid.
    expect(text).toBe('We have been on this corner since 1998.');
    expect(generated).toBe(false);
  });

  it('says so when the text was assembled', () => {
    // The page has to be able to mark it. A reader cannot judge a description without knowing
    // whether the business wrote it.
    expect(describeBusiness(imported).generated).toBe(true);
  });

  it('caps the terms so it reads as a sentence, not a keyword dump', () => {
    const { text } = describeBusiness({
      ...imported,
      keywords: Array.from({ length: 20 }, (_, i) => `item${i}`),
    });

    expect(text).toContain('item5');
    expect(text).not.toContain('item6');
  });

  it('works with nothing but a category', () => {
    // Some imported rows have no locality and no vocabulary yet. A record that renders a bare
    // category is thin; one that throws is a broken page.
    const { text } = describeBusiness({ categoryName: 'Bakery' });

    expect(text).toBe('Bakery.');
  });

  it('drops a missing locality without leaving a dangling comma', () => {
    const { text } = describeBusiness({ categoryName: 'Bakery', cityName: 'Hyderabad' });

    expect(text).toBe('Bakery in Hyderabad.');
  });
});

describe('attributionFor', () => {
  it('names the source and the licence', () => {
    // Not presentation polish: ODbL and CDLA both require attribution to travel with the
    // data, so a page rendering the record without this is using it outside its licence.
    expect(attributionFor({ sourceName: 'OpenStreetMap', licenceName: 'ODbL 1.0' })).toBe(
      'Details from OpenStreetMap, licensed under ODbL 1.0.',
    );
  });

  it('prefers wording the importer supplied', () => {
    expect(
      attributionFor({
        sourceName: 'OpenStreetMap',
        licenceName: 'ODbL 1.0',
        attributionText: '© OpenStreetMap contributors',
      }),
    ).toBe('© OpenStreetMap contributors');
  });

  it('says nothing for a record a person created', () => {
    expect(attributionFor({})).toBeNull();
  });
});
