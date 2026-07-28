import { ModelSuggestionsService } from '../src/categories/model-suggestions.service';

/**
 * Model-name suggestions.
 *
 * These run against the real `taxonomy.json` rather than a fixture, on purpose. The file is
 * the deliverable of the collector script, and a fixture would keep passing after a bad
 * collector run replaced it with something useless — which is exactly the failure worth
 * catching, since nothing else reads this file.
 */
describe('ModelSuggestionsService', () => {
  const service = new ModelSuggestionsService();

  it('suggests models for a vehicle category', () => {
    // The default cap is 20 and this brand has more than that, so ask for the full set --
    // the point here is that the taxonomy loaded, not how a short list is trimmed.
    const suggestions = service.suggest('vehicles', { brand: 'MARUTI_SUZUKI', limit: 50 });

    expect(suggestions.length).toBeGreaterThan(5);
    expect(suggestions).toContain('Swift');
  });

  it('reaches the same list through a child category', () => {
    // Someone posting a car picks "Cars", not "Vehicles". Suggestions have to follow.
    expect(service.suggest('cars', { brand: 'MARUTI_SUZUKI', limit: 50 })).toContain('Swift');
  });

  it('ranks a prefix match above a mere substring', () => {
    const suggestions = service.suggest('vehicles', { q: 'swift' });

    // Someone typing "swift" wants the Swift first, not the Swift Dzire — and definitely not
    // something that merely contains the word further along.
    expect(suggestions[0]).toBe('Swift');
  });

  it('searches across every brand when none has been chosen', () => {
    // People type the model before they think about the manufacturer.
    expect(service.suggest('vehicles', { q: 'creta' }).length).toBeGreaterThan(0);
  });

  it('matches case-insensitively', () => {
    expect(service.suggest('vehicles', { q: 'SWIFT' })).toContain('Swift');
  });

  it('caps the response even when asked for more', () => {
    // An autocomplete that returns nine hundred names is a page, not a suggestion.
    expect(service.suggest('vehicles', { limit: 500 }).length).toBeLessThanOrEqual(50);
  });

  it('returns nothing for a category with no model taxonomy', () => {
    // Appliances deliberately have no model list: nobody searches by appliance model number.
    expect(service.suggest('tv-appliances')).toEqual([]);
    expect(service.suggest('not-a-real-category')).toEqual([]);
  });

  it('returns nothing for an unknown brand rather than everything', () => {
    // Falling back to the full list would silently ignore the filter the user set.
    expect(service.suggest('vehicles', { brand: 'NOT_A_BRAND' })).toEqual([]);
  });

  it('carries phone and laptop taxonomies too', () => {
    expect(service.suggest('mobile-phones', { q: 'galaxy' }).length).toBeGreaterThan(0);
    expect(service.suggest('laptops-computers').length).toBeGreaterThan(0);
  });
});
