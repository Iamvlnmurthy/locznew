import { localizedName } from '../src/common/utils/localized-name';

/**
 * Which language a business profile speaks.
 *
 * The profile is served at /b/x, /te/b/x and /hi/b/x. Until now all three carried the same
 * English category and city names in the title, the meta description and the composed
 * description — translated chrome around English content. These cases cover the fallback
 * behaviour, which matters more than the happy path: 640 cities have only 8 Telugu names.
 */
describe('the name shown to a reader', () => {
  const category = { name: 'Grocery & kirana', nameTe: 'కిరాణా', nameHi: 'किराना' };

  it('speaks Telugu on a Telugu page', () => {
    expect(localizedName(category, 'te')).toBe('కిరాణా');
  });

  it('speaks Hindi on a Hindi page', () => {
    expect(localizedName(category, 'hi')).toBe('किराना');
  });

  it('speaks English everywhere else', () => {
    expect(localizedName(category, 'en')).toBe('Grocery & kirana');
    expect(localizedName(category, undefined)).toBe('Grocery & kirana');
    expect(localizedName(category, 'fr')).toBe('Grocery & kirana');
  });

  it('falls back to English rather than showing nothing', () => {
    // Most cities have no Telugu name yet. An English city name is imperfect; a blank one in
    // the middle of a title is broken.
    const city = { name: 'Muzaffarpur', nameTe: null, nameHi: null };
    expect(localizedName(city, 'te')).toBe('Muzaffarpur');
  });

  it('treats a whitespace-only translation as missing', () => {
    expect(localizedName({ name: 'Salem', nameTe: '   ' }, 'te')).toBe('Salem');
  });

  it('leaves a name alone when the locale is one we do not translate into', () => {
    // Tamil Nadu, Kerala and Karnataka hold roughly 800,000 businesses between them and
    // LocZ has no Tamil, Malayalam or Kannada. Asking for one must fall back, not blank out.
    expect(localizedName(category, 'ta')).toBe('Grocery & kirana');
    expect(localizedName(category, 'ml')).toBe('Grocery & kirana');
  });

  it('is not confused by the case of the locale', () => {
    // The stored preference is "TE"; the URL prefix is "te".
    expect(localizedName(category, 'TE')).toBe('కిరాణా');
  });
});
