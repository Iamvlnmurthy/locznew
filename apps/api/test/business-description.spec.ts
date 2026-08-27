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

    expect(text).toContain('toor dal, atta and cooking oil');
    expect(text).not.toMatch(/\bbest\b|\bcheapest\b|\btop-rated\b/i);
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

  it('places it by landmark — a fact from the address', () => {
    const { text } = describeBusiness({
      ...imported,
      landmark: 'Inorbit Mall',
      pincode: '500081',
    });

    // "near X" is drawn straight from the address, so it locates the business precisely
    // without asserting anything about it.
    expect(text).toContain('Located near Inorbit Mall.');
    expect(text).not.toMatch(/\bbest\b|\bleading\b|\btrusted\b|\bpopular\b/i);
  });

  it('never writes the pincode into the prose', () => {
    // Every imported record has a pincode, so "in the NNNNNN area" was the one sentence
    // millions of pages had in common — filler that says nothing a reader wants and makes the
    // pages look duplicated. It belongs in the address block, not in a description.
    const { text } = describeBusiness({ ...imported, pincode: '500081' });

    expect(text).not.toContain('500081');
    expect(text).not.toContain('Located');
  });

  it('adds no location line when no landmark is known', () => {
    const { text } = describeBusiness(imported);
    expect(text).not.toContain('Located');
  });

  it('works with nothing but a category', () => {
    // Some imported rows have no locality and no vocabulary yet. A record that renders a bare
    // category is thin; one that throws is a broken page.
    const { text } = describeBusiness({ categoryName: 'Bakery' });

    expect(text).toBe('Bakery.');
  });

  it('generates rich, fact-driven prose when name, address, and landmark are provided', () => {
    const bookStore = {
      id: '03d2bcb3-d356-4ed5-9535-a09490ef1136',
      name: 'Bibliotheque Book Store',
      categoryName: 'Book shops',
      addressLine: 'NRS Annex Road',
      localityName: 'CUC',
      mandal: 'Serilingampally',
      cityName: 'Hyderabad',
      landmark: 'University of Hyderabad',
      keywords: ['bookstore', 'books music and video store'],
    };

    const { text, generated } = describeBusiness(bookStore);

    expect(text).toContain('NRS Annex Road in CUC, Serilingampally, Hyderabad');
    expect(text).toContain('University of Hyderabad');
    expect(text).toContain('Bibliotheque Book Store');
    expect(text).toContain('bookstore and books music and video store');
    expect(generated).toBe(true);
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

/**
 * The sentence around the names, not just the names.
 *
 * Localising the category and city produced "కిరాణా దుకాణాలు in Muzaffarpur" — a Telugu noun
 * inside an English sentence, which reads worse than either language alone. These cases are
 * about the words in between, and about word order: neither Telugu nor Hindi puts the place
 * after the thing the way English does.
 */
describe('a description in the reader’s language', () => {
  const shop = {
    categoryName: 'కిరాణా దుకాణాలు',
    localityName: null,
    cityName: 'ముజఫర్‌పుర్',
    landmark: 'ఆదర్శ విద్యా మందిర్',
    keywords: ['బియ్యం', 'పప్పు'],
  };

  it('puts the place before the category in Telugu, as Telugu does', () => {
    const { text } = describeBusiness(shop, 'te');

    // Not "కిరాణా దుకాణాలు in ముజఫర్‌పుర్" — the frame is Telugu, not a translated preposition
    // dropped into an English skeleton.
    expect(text).toContain('ముజఫర్‌పుర్లో కిరాణా దుకాణాలు.');
    expect(text).not.toContain(' in ');
    expect(text).not.toContain('Located');
    expect(text).not.toContain('People look here');
  });

  it('joins list terms with the Telugu word for "and"', () => {
    const { text } = describeBusiness(shop, 'te');
    expect(text).toContain('మరియు');
    expect(text).not.toMatch(/\band\b/);
  });

  it('ends Hindi sentences with a danda, not a full stop', () => {
    const { text } = describeBusiness({ ...shop, categoryName: 'किराना दुकानें' }, 'hi');

    expect(text).toContain('।');
    expect(text).toContain('के पास');
  });

  it('is unchanged for English, and for a language we have no frames for', () => {
    const english = {
      categoryName: 'Grocery & kirana',
      cityName: 'Muzaffarpur',
      landmark: 'Inorbit Mall',
      keywords: ['rice', 'dal'],
    };

    // Tamil has no frames here. Falling back to English keeps the sentence readable rather
    // than half-built.
    expect(describeBusiness(english, 'ta').text).toBe(describeBusiness(english).text);
    expect(describeBusiness(english).text).toContain('Grocery & kirana in Muzaffarpur.');
    expect(describeBusiness(english).text).toContain('rice and dal');
  });
});
