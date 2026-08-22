import {
  rankFeed,
  ringOf,
  scoreEvent,
  paginate,
  type RankableEvent,
} from '../../src/news/feed/ranking';
import {
  buildRefineMessages,
  refineCacheKey,
  refineWithFallback,
  proactiveLanguagesForState,
  type RefinementProvider,
} from '../../src/news/refine/refinement';

const GACHIBOWLI = { lat: 17.4401, lng: 78.3489 };
const NOW = Date.parse('2026-08-22T12:00:00.000Z');
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

function ev(p: Partial<RankableEvent>): RankableEvent {
  return { id: 'x', category: 'local', publishedAt: iso(1), latitude: null, longitude: null, ...p };
}

describe('feed ranking', () => {
  it('assigns ring 0 to an event in the same locality and a wide ring to a scope-only event', () => {
    const here = ringOf(ev({ latitude: 17.4401, longitude: 78.3489 }), GACHIBOWLI);
    expect(here.ring).toBe(0);
    expect(here.distanceKm).toBe(0);
    const stateWide = ringOf(ev({ latitude: null, longitude: null, scope: 'state' }), GACHIBOWLI);
    expect(stateWide.ring).toBe(5);
    expect(stateWide.distanceKm).toBeNull();
  });

  it('a fresh nearby event outranks an equally-fresh far one; emergencies override everything', () => {
    const near = ev({ id: 'near', latitude: 17.4483, longitude: 78.3915, publishedAt: iso(2) }); // ~4.5km
    const far = ev({ id: 'far', latitude: 17.385, longitude: 78.4867, publishedAt: iso(2) }); // ~16km
    expect(scoreEvent(near, ringOf(near, GACHIBOWLI).ring, NOW)).toBeGreaterThan(
      scoreEvent(far, ringOf(far, GACHIBOWLI).ring, NOW),
    );
    const emergency = ev({ id: 'em', latitude: 17.385, longitude: 78.4867, isEmergency: true });
    const ranked = rankFeed([near, far, emergency], GACHIBOWLI, {}, NOW);
    expect(ranked[0]!.id).toBe('em'); // emergency first despite being far
  });

  it('nearest-first ordering within the recency window', () => {
    const near = ev({ id: 'near', latitude: 17.4401, longitude: 78.3489, publishedAt: iso(5) });
    const far = ev({ id: 'far', latitude: 17.385, longitude: 78.4867, publishedAt: iso(1) });
    const ranked = rankFeed([far, near], GACHIBOWLI, {}, NOW);
    expect(ranked.map((r) => r.id)).toEqual(['near', 'far']);
  });

  it('facets filter by category, scope cap, date window and top-only', () => {
    const events = [
      ev({ id: 'sport', category: 'sports', latitude: 17.44, longitude: 78.35 }),
      ev({ id: 'weather', category: 'weather', latitude: 17.44, longitude: 78.35 }),
      ev({ id: 'far-state', category: 'weather', scope: 'state', latitude: null, longitude: null }),
      ev({
        id: 'old',
        category: 'weather',
        latitude: 17.44,
        longitude: 78.35,
        publishedAt: iso(24 * 9),
      }),
      ev({
        id: 'toptrust',
        category: 'weather',
        latitude: 17.44,
        longitude: 78.35,
        trustScore: 80,
      }),
    ];
    expect(rankFeed(events, GACHIBOWLI, { category: 'sports' }, NOW).map((r) => r.id)).toEqual([
      'sport',
    ]);
    // scope=local drops the state-wide event
    expect(
      rankFeed(events, GACHIBOWLI, { scope: 'local' }, NOW).some((r) => r.id === 'far-state'),
    ).toBe(false);
    // 9-day-old event falls outside the 7-day window
    expect(rankFeed(events, GACHIBOWLI, {}, NOW).some((r) => r.id === 'old')).toBe(false);
    // topOnly keeps only high-signal
    expect(rankFeed(events, GACHIBOWLI, { topOnly: true }, NOW).map((r) => r.id)).toEqual([
      'toptrust',
    ]);
  });

  it('paginate reports more remaining for infinite scroll', () => {
    const items = [1, 2, 3, 4, 5];
    expect(paginate(items, 0, 2)).toEqual({ page: [1, 2], hasMore: true });
    expect(paginate(items, 4, 2)).toEqual({ page: [5], hasMore: false });
  });
});

describe('news refinement', () => {
  it('builds a faithful, MODERN-Telugu prompt (not literary)', () => {
    const [system, user] = buildRefineMessages({
      body: 'Heavy rain in Gachibowli.',
      targetLang: 'te',
    });
    expect(system!.content).toMatch(/ONLY facts/i);
    expect(system!.content).toMatch(/Telugu/);
    expect(system!.content).toMatch(/NOT old, literary|grandhika/i); // the modern-Telugu fix
    expect(user!.content).toContain('Heavy rain in Gachibowli.');
    expect(user!.content).toMatch(/strict JSON/i);
  });

  it('cache key is per event and language', () => {
    expect(refineCacheKey('e1', 'te')).toBe('news:refine:e1:te');
    expect(refineCacheKey('e1', 'en')).not.toBe(refineCacheKey('e1', 'te'));
  });

  it('falls back to the next provider when the first fails, and reports which succeeded', async () => {
    const failing: RefinementProvider = { name: 'local', refine: async () => null };
    const throwing: RefinementProvider = {
      name: 'cloud-a',
      refine: async () => {
        throw new Error('429');
      },
    };
    const good: RefinementProvider = {
      name: 'cloud-b',
      refine: async () => ({ title: 'T', summary: 'S' }),
    };
    const out = await refineWithFallback([failing, throwing, good], {
      body: 'x',
      targetLang: 'en',
    });
    expect(out).toEqual({ title: 'T', summary: 'S', provider: 'cloud-b' });
    const none = await refineWithFallback([failing, throwing], { body: 'x', targetLang: 'en' });
    expect(none).toBeNull();
  });

  it('proactive languages are region-scoped (Telangana → te/hi/ur/en, not all 13)', () => {
    const tg = proactiveLanguagesForState('Telangana');
    expect(tg).toEqual(expect.arrayContaining(['en', 'te', 'hi', 'ur']));
    expect(tg).not.toContain('ta');
    expect(proactiveLanguagesForState('Tamil Nadu')).toEqual(expect.arrayContaining(['en', 'ta']));
  });
});
