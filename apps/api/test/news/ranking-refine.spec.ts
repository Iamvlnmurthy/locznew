import {
  areDuplicateTitles,
  dedupeRanked,
  rankFeed,
  ringOf,
  scoreEvent,
  paginate,
  type RankableEvent,
} from '../../src/news/feed/ranking';
import { cleanText, stripPublisherSuffix } from '../../src/news/feed/event-shaper';
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

  it('collapses one story reported by many publishers, keeps distinct stories', () => {
    // The real repetition seen in prod: one building collapse from several outlets.
    const titles = [
      'Multi-storey building collapses in Madhapur',
      'Under-Construction Building Collapses in Madhapur, Hyderabad - NewsMeter',
      'Building collapse in Madhapur, Hyderabad', // same story, different words
      'Hyderabad Metro extends operating hours on weekends', // distinct
    ];
    const events = titles.map((title, i) =>
      ev({ id: `e${i}`, title, latitude: 17.44, longitude: 78.35, publishedAt: iso(i + 1) }),
    );
    const ranked = rankFeed(events, GACHIBOWLI, {}, NOW);
    const deduped = dedupeRanked(ranked);
    // 3 collapse reports → 1 card (+2 merged), metro stays → 2 cards total.
    expect(deduped).toHaveLength(2);
    const collapse = deduped.find((e) => (e.title ?? '').toLowerCase().includes('collapse'));
    expect(collapse!.sourceCount).toBe(3);
  });

  it('duplicate detection: same story true, unrelated false, too-short false', () => {
    expect(
      areDuplicateTitles(
        'Multi-storey building collapses in Madhapur',
        'Building collapse in Madhapur, Hyderabad',
      ),
    ).toBe(true);
    expect(
      areDuplicateTitles(
        'Cricket match at Uppal stadium tonight',
        'GHMC clears garbage in Kukatpally',
      ),
    ).toBe(false);
    expect(areDuplicateTitles('Rain today', 'Rain now')).toBe(false); // too few significant tokens
  });
});

describe('news text cleaning', () => {
  it('decodes entities and strips the Google-News publisher suffix', () => {
    expect(cleanText('Building collapse&nbsp;&nbsp; in Madhapur')).toBe(
      'Building collapse in Madhapur',
    );
    expect(cleanText('Tom &amp; Jerry &#39;fun&#39;')).toBe(`Tom & Jerry 'fun'`);
    expect(stripPublisherSuffix('Hyderabad building collapses - V6 Velugu')).toBe(
      'Hyderabad building collapses',
    );
    // a long clause after a dash is not a short publisher suffix, so it is preserved
    const longClause = 'Assembly - a detailed look at what the new budget means for local roads';
    expect(stripPublisherSuffix(longClause)).toBe(longClause);
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
