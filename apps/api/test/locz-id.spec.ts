import { businessSlug, loczId } from '../src/common/utils/slug.util';

/**
 * The reference code shown on a business profile.
 *
 * It is not new data. Every imported slug already ended in `<batch>-<token>`, and that pair
 * is unique across all 3,414,974 records — it was put there to keep two shops with the same
 * name from fighting over one URL. Surfacing it costs no migration and changes no URL; the
 * point of these cases is that the code shown is always exactly what is in the address bar.
 */
describe('the LocZ ID', () => {
  it('is the tail of the slug, upper-cased', () => {
    expect(loczId('friendly-icecream-000j-hrcf')).toBe('000J-HRCF');
    expect(loczId('budgett-kirana-store-0004-1q12')).toBe('0004-1Q12');
  });

  it('reads the tail, not a lookalike earlier in the name', () => {
    // "cafe-1234" is part of the shop's name here. Anchoring to the end is what stops the
    // page showing a code that is not the one in the URL.
    expect(loczId('cafe-1234-coffee-ab12-cd34')).toBe('AB12-CD34');
  });

  it('is null when the slug has no such tail, rather than an invented code', () => {
    expect(loczId('sri-lakshmi-electronics-hyderabad')).toBeNull();
    expect(loczId('shop')).toBeNull();
  });

  it('gives a business created on LocZ a code too', () => {
    const slug = businessSlug('Sri Lakshmi Electronics', 'Hyderabad');

    expect(slug).toMatch(/^sri-lakshmi-electronics-hyderabad-[0-9a-f]{4}-[0-9a-f]{4}$/);
    expect(loczId(slug)).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('still produces a usable slug for a name in a script with no ASCII form', () => {
    // A Telugu-only name slugifies to nothing. The old code would have produced a slug
    // starting with "-", which is not a URL anybody should be given.
    const slug = businessSlug('శ్రీ లక్ష్మి', '');

    expect(slug).toMatch(/^business-[0-9a-f]{4}-[0-9a-f]{4}$/);
    expect(loczId(slug)).not.toBeNull();
  });

  it('does not collide across many generations', () => {
    const seen = new Set(Array.from({ length: 5000 }, () => businessSlug('Cafe', 'Pune')));
    expect(seen.size).toBe(5000);
  });
});
