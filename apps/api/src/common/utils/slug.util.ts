import { randomBytes } from 'node:crypto';

/**
 * URL-safe slug. Devanagari and Telugu characters have no ASCII transliteration here,
 * so a title written entirely in those scripts reduces to an empty string — callers
 * must handle that by falling back to a generated suffix rather than producing "/".
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * Listing slugs must be globally unique and are part of a shareable URL. A short random
 * suffix makes collisions a non-issue without a retry loop, and keeps two listings
 * called "Honda Activa" from fighting over one URL.
 */
export function listingSlug(title: string): string {
  const base = slugify(title);
  const suffix = randomBytes(4).toString('hex');
  return base ? `${base}-${suffix}` : `listing-${suffix}`;
}

/**
 * The public reference code for a business, taken from the tail of its slug.
 *
 * Every imported record was slugged `name-<batch>-<token>`, and that four-and-four pair is
 * unique across all three and a half million of them. It was only ever there to stop two
 * shops with the same name fighting over one URL, and it read as machine noise in the
 * address bar — but a stable, unique, short code is exactly what a shopkeeper needs to quote
 * when they ring up to claim their listing, and what support needs to find it again.
 *
 * So it is surfaced rather than hidden: the same characters that are already in the URL,
 * upper-cased and labelled. Nothing is stored and no URL changes — three and a half million
 * indexed addresses stay exactly as they are.
 *
 * Returns null for a slug with no such tail, so callers show nothing rather than a made-up
 * code.
 */
export function loczId(slug: string): string | null {
  const match = /([a-z0-9]{4})-([a-z0-9]{4})$/.exec(slug);
  return match ? `${match[1]!}-${match[2]!}`.toUpperCase() : null;
}

/**
 * A slug for a business somebody creates, carrying the same reference code as an imported one.
 *
 * The city is in the slug because "sri lakshmi electronics" exists in every town in the
 * state. The random tail then makes the whole thing unique without a read-then-write race,
 * and — the reason it is here rather than a collision counter — it means every business on
 * LocZ has a reference code, not just the imported ones.
 */
export function businessSlug(name: string, cityName: string): string {
  const base = [slugify(name), slugify(cityName)].filter(Boolean).join('-');
  const tail = `${randomBytes(2).toString('hex')}-${randomBytes(2).toString('hex')}`;
  return base ? `${base}-${tail}` : `business-${tail}`;
}
