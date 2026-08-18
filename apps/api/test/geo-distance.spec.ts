import {
  distanceMetres,
  distanceMetresOrNull,
  withinRadius,
} from '../src/common/utils/geo-distance';

describe('geo-distance', () => {
  // Hyderabad landmarks: Charminar and HITEC City are ~13.78 km apart (great-circle).
  const charminar = { latitude: 17.3616, longitude: 78.4747 };
  const hitecCity = { latitude: 17.4435, longitude: 78.3772 };

  it('measures a known distance within 1%', () => {
    const metres = distanceMetres(charminar, hitecCity);
    expect(metres).toBeGreaterThan(13_650);
    expect(metres).toBeLessThan(13_920);
  });

  it('is zero for the same point', () => {
    expect(distanceMetres(charminar, charminar)).toBeCloseTo(0, 5);
  });

  it('rounds to whole metres when both points are present', () => {
    const metres = distanceMetresOrNull(charminar, hitecCity);
    expect(metres).toBeDefined();
    expect(Number.isInteger(metres)).toBe(true);
  });

  it('returns undefined — not a false "0 m" — when the point has no coordinates', () => {
    expect(distanceMetresOrNull(charminar, { latitude: null, longitude: null })).toBeUndefined();
    expect(distanceMetresOrNull(charminar, { latitude: 17.4, longitude: null })).toBeUndefined();
  });

  it('returns undefined when the viewer shared no origin', () => {
    expect(distanceMetresOrNull(undefined, hitecCity)).toBeUndefined();
  });

  describe('withinRadius', () => {
    const items = [
      { id: 'a', distanceMeters: 800 },
      { id: 'b', distanceMeters: 5_000 },
      { id: 'c', distanceMeters: 12_000 },
      { id: 'd' }, // unmeasured
    ];

    it('keeps only items inside the radius, plus the unmeasured ones', () => {
      const kept = withinRadius(items, 5_000).map((i) => i.id);
      expect(kept).toEqual(['a', 'b', 'd']);
    });

    it('returns everything unchanged when no radius is given', () => {
      expect(withinRadius(items, undefined)).toHaveLength(4);
    });
  });
});
