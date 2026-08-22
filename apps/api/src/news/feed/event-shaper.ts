/**
 * Shape a parsed article + its resolved place into the public feed-event card the web/mobile
 * clients render (docs/NEWS_INTELLIGENCE_ARCHITECTURE.md §10). The public projection is
 * deliberately headline + summary + source link + location — never the full body — so this is
 * also the licence boundary in code.
 */
import type { RssItem } from '../ingest/rss.parser';
import type { ResolvedPlace } from '../geo/location-resolver';

export type NewsCategory =
  | 'weather'
  | 'traffic'
  | 'crime'
  | 'accidents'
  | 'civic'
  | 'utilities'
  | 'government'
  | 'politics'
  | 'health'
  | 'education'
  | 'jobs'
  | 'business'
  | 'sports'
  | 'entertainment'
  | 'local';

export interface FeedEvent {
  slug: string;
  title: string;
  summary: string | null;
  category: NewsCategory;
  imageUrl: string | null;
  source: string | null;
  url: string;
  language: string;
  publishedAt: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
}

const CATEGORY_KEYWORDS: Array<[NewsCategory, RegExp]> = [
  ['weather', /\b(rain|flood|cyclone|storm|heat\s?wave|imd|monsoon|waterlog)\w*/i],
  ['traffic', /\b(traffic|diversion|road\s?closure|jam|route|flyover|metro)\w*/i],
  ['accidents', /\b(accident|collision|crash|derail|fire|blaze)\w*/i],
  ['crime', /\b(murder|theft|robbery|arrest|police|fraud|assault|kidnap)\w*/i],
  ['utilities', /\b(power\s?cut|electricity|discom|water\s?supply|outage|maintenance)\w*/i],
  ['civic', /\b(ghmc|municipal|sanitation|garbage|pothole|drainage|corporation)\w*/i],
  ['government', /\b(govt|government|minister|cm |collector|scheme|notification|go\d)\w*/i],
  ['politics', /\b(election|party|mla|mp |assembly|poll|campaign)\w*/i],
  ['health', /\b(hospital|dengue|covid|virus|health|clinic|vaccine)\w*/i],
  ['education', /\b(school|college|university|exam|student|admission|jntu|osmania)\w*/i],
  ['jobs', /\b(job|recruit|vacancy|hiring|notification.*posts|employment)\w*/i],
  ['sports', /\b(cricket|match|tournament|stadium|kabaddi|badminton)\w*/i],
  ['entertainment', /\b(film|movie|cinema|actor|music|concert|ott)\w*/i],
  ['business', /\b(startup|company|ipo|market|investment|business)\w*/i],
];

/** Best-effort category from the headline+summary. Falls back to 'local'. */
export function guessCategory(text: string): NewsCategory {
  for (const [category, re] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return category;
  }
  return 'local';
}

/**
 * SEO slug for locz.in/news/<slug>. Romanises where it can and always appends a short hash so
 * two same-day headlines never collide. Non-Latin scripts (Telugu/Hindi) that don't romanise
 * fall back to the hash-stemmed form, still a valid, unique, crawlable path.
 */
export function slugify(title: string, seed: string): string {
  const ascii = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip Latin diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  const hash = hash8(seed);
  return ascii ? `${ascii}-${hash}` : `news-${hash}`;
}

/** Tiny stable non-crypto hash (FNV-1a) → 8 hex chars. Deterministic across runs. */
export function hash8(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const EARTH_KM = 6371;
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function toFeedEvent(
  item: RssItem,
  place: ResolvedPlace | null,
  opts: { language?: string; viewer?: { lat: number; lng: number } } = {},
): FeedEvent {
  const distanceKm =
    place && opts.viewer
      ? Math.round(haversineKm(opts.viewer.lat, opts.viewer.lng, place.lat, place.lng) * 10) / 10
      : null;
  return {
    slug: slugify(item.title, item.guid),
    title: item.title,
    summary: item.summary,
    category: guessCategory(`${item.title} ${item.summary ?? ''}`),
    imageUrl: item.imageUrl,
    source: item.source,
    url: item.link,
    language: opts.language ?? 'en',
    publishedAt: item.publishedAt,
    locality: place?.name ?? null,
    latitude: place?.lat ?? null,
    longitude: place?.lng ?? null,
    distanceKm,
  };
}
