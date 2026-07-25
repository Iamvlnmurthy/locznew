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
