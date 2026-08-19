import { categoryNameToArea } from '../common/utils/discovery-areas';

describe('categoryNameToArea', () => {
  it.each([
    ['Groceries & Provisions', 'food'],
    ['Fruits & Vegetables', 'food'],
    ['Dairy, Bakery & Eggs', 'food'],
    ['Meat, Fish & Poultry', 'food'],
    ['Health & Personal Care', 'health'],
    ['Beauty & Cosmetics', 'health'],
    ['Vehicles', 'mobility'],
    ['Sports, Fitness & Outdoors', 'play'],
    ['Pets & Pet Supplies', 'pets'],
    ['Jobs', 'jobs'],
    ['Events', 'events'],
    ['Real Estate & Rentals', 'rentals'],
    ['Local Offers', 'deals'],
    ['Hardware, Tools & Building', 'home'],
    ['Farm, Garden & Agriculture', 'home'],
    ['Electronics', 'shopping'],
    ['Clothing & Footwear', 'shopping'],
    ['Home & Kitchen', 'shopping'],
    ['Books, Stationery & Office', 'shopping'],
    ['Services', 'services'],
    ['Businesses', 'businesses'],
  ])('maps %s to %s', (name, area) => {
    expect(categoryNameToArea(name)).toBe(area);
  });

  it('returns null for an unmappable name', () => {
    expect(categoryNameToArea('Something Unknown')).toBeNull();
  });

  it('does not misfile Home & Kitchen as the home (hardware) area', () => {
    // "Home & Kitchen" is retail shopping, not the hardware/DIY "home" bucket.
    expect(categoryNameToArea('Home & Kitchen')).toBe('shopping');
  });
});
