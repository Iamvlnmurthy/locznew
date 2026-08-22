import {
  InMemoryGazetteer,
  mentions,
  primaryPlace,
  resolvePlaces,
  type PlaceEntry,
} from '../../src/news/geo/location-resolver';
import {
  guessCategory,
  hash8,
  haversineKm,
  slugify,
  toFeedEvent,
} from '../../src/news/feed/event-shaper';
import type { RssItem } from '../../src/news/ingest/rss.parser';

const GACHIBOWLI = { lat: 17.4401, lng: 78.3489 };
const HYDERABAD = { lat: 17.385, lng: 78.4867 };

const SEED: PlaceEntry[] = [
  {
    entityId: 'city-hyd',
    entityType: 'CITY',
    name: 'Hyderabad',
    aliases: ['హైదరాబాద్', 'hyd'],
    ...HYDERABAD,
  },
  {
    entityId: 'loc-gachibowli',
    entityType: 'LOCALITY',
    name: 'Gachibowli',
    aliases: ['గచ్చిబౌలి'],
    cityId: 'city-hyd',
    ...GACHIBOWLI,
  },
  {
    entityId: 'loc-madhapur',
    entityType: 'LOCALITY',
    name: 'Madhapur',
    aliases: ['మాదాపూర్'],
    cityId: 'city-hyd',
    lat: 17.4483,
    lng: 78.3915,
  },
];
const gaz = new InMemoryGazetteer(SEED);

describe('location resolver', () => {
  it('word-boundary matching (car ≠ carefully) but substring for non-Latin scripts', () => {
    expect(mentions('drive a car home', 'car')).toBe(true);
    expect(mentions('handle it carefully', 'car')).toBe(false);
    expect(mentions('గచ్చిబౌలిలో వర్షం', 'గచ్చిబౌలి')).toBe(true);
  });

  it('resolves a locality and ranks it above the city, with the locality as primary', () => {
    const resolved = resolvePlaces('Heavy rain floods Gachibowli in Hyderabad', gaz);
    expect(resolved.map((r) => r.name)).toEqual(['Gachibowli', 'Hyderabad']);
    const p = primaryPlace(resolved)!;
    expect(p.entityType).toBe('LOCALITY');
    expect(p.confidence).toBeGreaterThanOrEqual(resolved[1].confidence);
  });

  it('resolves a Telugu locality alias to the same entity + coordinates', () => {
    const resolved = resolvePlaces('మాదాపూర్‌లో భారీ వర్షం', gaz);
    expect(resolved[0].entityId).toBe('loc-madhapur');
    expect(resolved[0].lat).toBeCloseTo(17.4483, 3);
  });

  it('returns [] when no known place is mentioned', () => {
    expect(resolvePlaces('National GDP figures released', gaz)).toEqual([]);
  });
});

describe('event shaper', () => {
  it('guesses category from keywords, else local', () => {
    expect(guessCategory('Heavy rain and waterlogging in Gachibowli')).toBe('weather');
    expect(guessCategory('Traffic diversion at Hitec City junction')).toBe('traffic');
    expect(guessCategory('Scheduled power cut in Kondapur')).toBe('utilities');
    expect(guessCategory('A quiet day in the neighbourhood')).toBe('local');
  });

  it('slug is url-safe, bounded, unique-suffixed, and never empty for non-Latin titles', () => {
    const s = slugify('Heavy Rain Floods Gachibowli!', 'guid-1');
    expect(s).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}$/);
    expect(s.length).toBeLessThanOrEqual(69);
    const te = slugify('మాదాపూర్‌లో భారీ వర్షం', 'guid-2');
    expect(te).toMatch(/^news-[0-9a-f]{8}$/); // falls back but stays valid + unique
    expect(hash8('a')).not.toEqual(hash8('b'));
  });

  it('haversine distance Gachibowli→Hyderabad-centre is ~16 km', () => {
    const d = haversineKm(GACHIBOWLI.lat, GACHIBOWLI.lng, HYDERABAD.lat, HYDERABAD.lng);
    expect(d).toBeGreaterThan(13);
    expect(d).toBeLessThan(18);
  });

  it('shapes an item + place into a feed card with distance from the viewer', () => {
    const item: RssItem = {
      guid: 'g1',
      title: 'Heavy rain floods Gachibowli',
      link: 'https://example.com/a',
      summary: 'Waterlogging reported',
      publishedAt: '2026-04-20T06:30:00.000Z',
      source: 'The Hindu',
      imageUrl: 'https://cdn/x.jpg',
      categories: [],
    };
    const place = resolvePlaces(item.title, gaz)[0];
    const card = toFeedEvent(item, place, { language: 'en', viewer: GACHIBOWLI });
    expect(card.category).toBe('weather');
    expect(card.locality).toBe('Gachibowli');
    expect(card.distanceKm).toBe(0); // viewer is at Gachibowli
    expect(card.slug).toContain('heavy-rain-floods-gachibowli');
  });
});
