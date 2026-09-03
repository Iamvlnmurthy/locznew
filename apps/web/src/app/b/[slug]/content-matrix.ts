/**
 * Which version of a page each business gets.
 *
 * Varying wording alone stopped working, and measuring 4,300 pairs across three samples showed
 * why: two banks in the same city are handed the same neighbours by the nearby endpoint, so both
 * pages state the same facts however differently they phrase them. Median overlap sat near 18%
 * with the worst categories — diagnostic labs, money transfer, EV charging — above 40%, and those
 * are exactly the trades whose members hold no distinguishing data at all.
 *
 * So this picks a coordinate per business across independent axes, and the axes that matter most
 * choose *what the page says*, not just how. Two businesses sharing a neighbourhood name different
 * neighbours, count different radii, and carry different optional blocks. The text diverges because
 * the content does.
 *
 * Every axis is derived from the slug, so a page renders identically on every crawl — a page whose
 * facts reshuffle between visits looks unreliable, not varied.
 */

export interface Matrix {
  /** Which of the category passages this page carries (-1 = none available). */
  categorySlot: number;
  /** Index into the opening sentence forms. */
  opening: number;
  /** How the named neighbours are chosen from the list. */
  pick: 'nearest' | 'spread' | 'mid' | 'wide';
  /** The two radii this page counts within, in metres. */
  rings: [number, number];
  /** Whether the services line appears. */
  services: boolean;
  /** Whether the contact-channels line appears. */
  channels: boolean;
  /** Whether the pincode line appears. */
  pincode: boolean;
  /** Position of the neighbourhood paragraph among the others. */
  neighbourhoodFirst: boolean;
}

/** FNV-1a. Small, stable, and enough to spread slugs across a few dozen buckets. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Separate draws per axis.
 *
 * Slicing one hash into bit fields correlates the axes — pages agreeing on the first axis tend to
 * agree on the next — which is the opposite of what this is for. Salting per axis keeps them
 * independent, so two pages colliding on one still differ on the rest.
 */
function axis(seed: string, name: string, size: number): number {
  return hash(`${seed}|${name}`) % size;
}

const RING_PAIRS: Array<[number, number]> = [
  [500, 1000],
  [1000, 2000],
  [500, 2000],
  [2000, 5000],
];

const PICKS: Array<Matrix['pick']> = ['nearest', 'spread', 'mid', 'wide'];

export function matrixFor(seed: string, categoryVariants: number): Matrix {
  return {
    categorySlot: categoryVariants > 0 ? axis(seed, 'cat', categoryVariants) : -1,
    opening: axis(seed, 'open', 64),
    pick: PICKS[axis(seed, 'pick', PICKS.length)],
    rings: RING_PAIRS[axis(seed, 'rings', RING_PAIRS.length)],
    // Three optional lines, present on roughly two pages in three. A page that carries every
    // block every time is a template again, however many wordings each block has.
    services: axis(seed, 'svc', 3) !== 0,
    channels: axis(seed, 'chan', 3) !== 0,
    pincode: axis(seed, 'pin', 4) !== 0,
    neighbourhoodFirst: axis(seed, 'order', 2) === 0,
  };
}

/**
 * Which neighbours this page names.
 *
 * The list arrives sorted by distance, so naming the closest three means every business in a
 * cluster names the same three — the single largest thing two same-category pages shared. Each
 * strategy reads a different part of the same true list: all four are accurate, and a reader is
 * better served by a page that mentions somewhere a kilometre away than by four pages that all
 * point at the same shop next door.
 */
export function selectNeighbours<T extends { distanceMeters?: number }>(
  sorted: T[],
  pick: Matrix['pick'],
  count = 3,
): T[] {
  if (sorted.length <= count) return sorted;
  switch (pick) {
    case 'nearest':
      return sorted.slice(0, count);
    case 'mid': {
      const start = Math.floor((sorted.length - count) / 2);
      return sorted.slice(start, start + count);
    }
    case 'wide':
      return sorted.slice(-count);
    case 'spread':
    default: {
      // One from each third, so the page shows the shape of the cluster rather than its edge.
      const step = Math.max(1, Math.floor(sorted.length / count));
      const out: T[] = [];
      for (let i = 0; i < count; i += 1) out.push(sorted[Math.min(i * step, sorted.length - 1)]);
      return out;
    }
  }
}
