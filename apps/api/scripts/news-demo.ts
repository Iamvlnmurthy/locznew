/**
 * DEMO (not shipped): pull real Google News RSS for the Gachibowli area, run it through the
 * real news pipeline (parseFeed → resolvePlaces → toFeedEvent), and emit the feed cards as JSON
 * so we can render them in web + mobile layouts for review. Uses the same in-memory gazetteer
 * shape production will back with the City/Locality/LocationAlias tables.
 *
 *   npx ts-node scripts/news-demo.ts > ../../scratch-news.json
 */
import { parseFeed } from '../src/news/ingest/rss.parser';
import {
  InMemoryGazetteer,
  resolvePlaces,
  primaryPlace,
  type PlaceEntry,
} from '../src/news/geo/location-resolver';
import { toFeedEvent, type FeedEvent } from '../src/news/feed/event-shaper';

const GACHIBOWLI = { lat: 17.4401, lng: 78.3489 };

// Hyderabad IT-corridor seed (real approx centroids). Production reads these from the DB.
const SEED: PlaceEntry[] = [
  {
    entityId: 'city-hyd',
    entityType: 'CITY',
    name: 'Hyderabad',
    aliases: ['హైదరాబాద్', 'Hyd'],
    lat: 17.385,
    lng: 78.4867,
  },
  {
    entityId: 'l-gachibowli',
    entityType: 'LOCALITY',
    name: 'Gachibowli',
    aliases: ['గచ్చిబౌలి'],
    cityId: 'city-hyd',
    lat: 17.4401,
    lng: 78.3489,
  },
  {
    entityId: 'l-madhapur',
    entityType: 'LOCALITY',
    name: 'Madhapur',
    aliases: ['మాదాపూర్'],
    cityId: 'city-hyd',
    lat: 17.4483,
    lng: 78.3915,
  },
  {
    entityId: 'l-kondapur',
    entityType: 'LOCALITY',
    name: 'Kondapur',
    aliases: ['కొండాపూర్'],
    cityId: 'city-hyd',
    lat: 17.4615,
    lng: 78.3678,
  },
  {
    entityId: 'l-hitec',
    entityType: 'LOCALITY',
    name: 'HITEC City',
    aliases: ['Hitech City', 'హైటెక్ సిటీ'],
    cityId: 'city-hyd',
    lat: 17.4435,
    lng: 78.3772,
  },
  {
    entityId: 'l-kukatpally',
    entityType: 'LOCALITY',
    name: 'Kukatpally',
    aliases: ['కూకట్‌పల్లి'],
    cityId: 'city-hyd',
    lat: 17.4948,
    lng: 78.3996,
  },
  {
    entityId: 'l-jubilee',
    entityType: 'LOCALITY',
    name: 'Jubilee Hills',
    aliases: ['జూబ్లీ హిల్స్'],
    cityId: 'city-hyd',
    lat: 17.4313,
    lng: 78.407,
  },
  {
    entityId: 'l-financial',
    entityType: 'LOCALITY',
    name: 'Financial District',
    aliases: ['Nanakramguda', 'నానక్‌రామ్‌గూడ'],
    cityId: 'city-hyd',
    lat: 17.4166,
    lng: 78.3421,
  },
  {
    entityId: 'l-miyapur',
    entityType: 'LOCALITY',
    name: 'Miyapur',
    aliases: ['మియాపూర్'],
    cityId: 'city-hyd',
    lat: 17.4968,
    lng: 78.3583,
  },
];
const gaz = new InMemoryGazetteer(SEED);

const FEEDS: Array<{ language: string; url: string }> = [
  {
    language: 'en',
    url:
      'https://news.google.com/rss/search?q=' +
      encodeURIComponent('Gachibowli OR Madhapur OR "Hitec City" OR Hyderabad') +
      '&hl=en-IN&gl=IN&ceid=IN:en',
  },
  {
    language: 'te',
    url:
      'https://news.google.com/rss/search?q=' +
      encodeURIComponent('గచ్చిబౌలి OR మాదాపూర్ OR హైదరాబాద్') +
      '&hl=te-IN&gl=IN&ceid=IN:te',
  },
];

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LocZ/1.0 (https://locz.in; support@locz.in)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const cards: FeedEvent[] = [];
  const seenSlugs = new Set<string>();

  for (const feed of FEEDS) {
    let xml = '';
    try {
      xml = await fetchFeed(feed.url);
    } catch (e) {
      process.stderr.write(`feed ${feed.language} failed: ${(e as Error).message}\n`);
      continue;
    }
    const items = parseFeed(xml, 40);
    for (const item of items) {
      const resolved = resolvePlaces(`${item.title} ${item.summary ?? ''}`, gaz);
      const place = primaryPlace(resolved);
      if (!place) continue; // demo: keep only items that resolve to a known Hyderabad place
      const card = toFeedEvent(item, place, { language: feed.language, viewer: GACHIBOWLI });
      if (seenSlugs.has(card.slug)) continue;
      seenSlugs.add(card.slug);
      cards.push(card);
    }
  }

  // Rank: nearest first, then freshest (the hyperlocal feed's core ordering).
  cards.sort((a, b) => {
    const da = a.distanceKm ?? 9999;
    const db = b.distanceKm ?? 9999;
    if (da !== db) return da - db;
    return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
  });

  process.stderr.write(`resolved ${cards.length} Gachibowli-area cards\n`);
  process.stdout.write(
    JSON.stringify(
      { viewer: 'Gachibowli', generatedFor: GACHIBOWLI, cards: cards.slice(0, 24) },
      null,
      2,
    ),
  );
}

void main();
