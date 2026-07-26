import { isWholeWord } from './search.service';

/**
 * The rule that stopped `car` returning an iPhone.
 *
 * Meilisearch prefix-matches the last word of a query, so a search for `car` matched an
 * iPhone whose description read "carefully used for two years". A description match now has
 * to cover a whole word; a title or category match still does not, because typing the start
 * of a product name is exactly how people search.
 *
 * Offsets are **byte** positions, which is the part worth testing hardest. Meilisearch reports
 * them in bytes while JavaScript indexes strings by UTF-16 code unit, and the two agree for
 * as long as the text is ASCII — so a character-index implementation passes every English
 * test and then misjudges every Telugu and Hindi listing, which is the half of the catalogue
 * least likely to be spot-checked by anyone reading these tests.
 */
describe('isWholeWord', () => {
  /** The byte offset of `needle`, the way Meilisearch would report it. */
  function byteOffset(text: string, needle: string): number {
    return Buffer.from(text.slice(0, text.indexOf(needle)), 'utf8').length;
  }

  function check(text: string, needle: string): boolean {
    return isWholeWord(text, byteOffset(text, needle), Buffer.from(needle, 'utf8').length);
  }

  it('rejects a prefix of a longer word — the original defect', () => {
    expect(check('Personal phone, carefully used for two years.', 'car')).toBe(false);
  });

  it('accepts the same letters when they are the whole word', () => {
    expect(check('Selling my car, single owner.', 'car')).toBe(true);
  });

  it('accepts a word at the very start and at the very end', () => {
    expect(check('car for sale', 'car')).toBe(true);
    expect(check('for sale car', 'car')).toBe(true);
  });

  it('treats punctuation as a boundary but letters as not', () => {
    expect(check('Great (car) here', 'car')).toBe(true);
    expect(check('Bought a carton', 'car')).toBe(false);
  });

  it('rejects a match that ends mid-word even when it starts cleanly', () => {
    // "care" inside "careful": starts at a real word boundary, ends inside the word. Checking
    // only the leading side would wrongly accept this.
    expect(check('Handle with careful packing', 'care')).toBe(false);
  });

  /**
   * The multibyte cases. Each of these passes trivially if offsets are treated as character
   * indices *and* the text is ASCII — so every one deliberately puts non-ASCII before the
   * match, which is where the two interpretations diverge.
   */
  describe('with non-ASCII text before the match', () => {
    it('handles an em dash, where byte and character offsets already differ', () => {
      expect(check('iPhone 13 — car for sale', 'car')).toBe(true);
      expect(check('iPhone 13 — carefully used', 'car')).toBe(false);
    });

    it('handles Telugu, where each glyph is three bytes', () => {
      expect(check('హైదరాబాద్ car అమ్మకానికి', 'car')).toBe(true);
      expect(check('హైదరాబాద్ carefully వాడారు', 'car')).toBe(false);
    });

    it('handles Hindi', () => {
      expect(check('नई दिल्ली car बिक्री', 'car')).toBe(true);
      expect(check('नई दिल्ली carefully इस्तेमाल', 'car')).toBe(false);
    });

    it('treats a Telugu word as a word, not as punctuation', () => {
      // Devanagari and Telugu letters are letters. If the boundary test only knew ASCII
      // `\w`, this would read the surrounding script as punctuation and accept everything.
      expect(check('ఫోన్అమ్మకం', 'ఫోన్')).toBe(false);
    });
  });

  it('accepts a match at the exact end of the text', () => {
    expect(check('for sale: car', 'car')).toBe(true);
  });
});
