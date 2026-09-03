/**
 * The one paragraph on a storefront that is genuinely about *this* place.
 *
 * 4.3M business pages were built from the same open dataset (Overture Places), and only 5 of
 * them carry a description. Everything else is a name, a phone number and an address arranged
 * by the same template, so Google measured two same-category pages at ~43% identical phrasing
 * and started collapsing them: "we have omitted some entries very similar to the 18 already
 * displayed". Restating fields Google already holds cannot fix that.
 *
 * What is not in Google's copy of the data is the *neighbourhood*: how many of this category
 * sit nearby, how tightly they cluster, and which ones are closest. That varies per business by
 * construction -- no two places share the same neighbours at the same distances -- so the
 * sentences below differ page to page without inventing a single fact. Every number here is
 * measured from rows the page has already fetched for its "similar businesses" strip, so this
 * costs no extra query.
 *
 * Deliberately NOT generated prose. With only a name and a category to work from, a model would
 * have to invent what a business sells or how long it has traded -- false claims about real
 * companies, and the same scaled-content pattern that caused the problem.
 */

export interface LocalContextInput {
  name: string;
  categoryName: string;
  /** Street or locality this business sits on — the human anchor for "around here". */
  area: string;
  pincode?: string | null;
  /** Neighbours of the same category, already sorted by distance by the nearby endpoint. */
  neighbours: Array<{ name: string; distanceMeters?: number }>;
  /** Radius the neighbours were fetched within, in km. */
  radiusKm: number;
  /** Stable per-page seed so a page keeps the same phrasing between renders. */
  seed: string;
  /** Localised distance units. Passed in so a Telugu page does not read "320 m" in English. */
  units: { m: string; km: string };
}

/** Small stable hash. Only needs to spread slugs across a handful of variants. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Every `prefix1`, `prefix2`... in the group, in order.
 *
 * `getMessageGroup` drops anything that is not a string, so the variants are numbered keys
 * rather than an array. Picking by hash rather than at random keeps a page's wording stable
 * across renders, which matters because a page whose sentences reshuffle on every crawl looks
 * less trustworthy, not more varied.
 */
function variants(group: Record<string, string>, prefix: string): string[] {
  const out: string[] = [];
  for (let i = 1; ; i += 1) {
    const value = group[`${prefix}${i}`];
    if (!value) break;
    out.push(value);
  }
  return out;
}

function pick(group: Record<string, string>, prefix: string, seed: string, salt: number): string {
  const options = variants(group, prefix);
  if (options.length === 0) return '';
  return options[hash(`${seed}:${salt}`) % options.length];
}

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(value),
    template,
  );
}

/** "320 m" under a kilometre, "1.4 km" above it — how a person would say it. */
function formatDistance(meters: number, units: { m: string; km: string }): string {
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} ${units.m}`;
  return `${(meters / 1000).toFixed(1)} ${units.km}`;
}

/**
 * Sentences describing this business's surroundings, or `[]` when there is nothing true to say.
 *
 * Returning nothing is the right answer for an isolated listing: a sentence reporting zero
 * neighbours would itself become boilerplate across every sparse page, which is the problem
 * this exists to solve.
 */
export function buildLocalContext(
  input: LocalContextInput,
  group: Record<string, string>,
  locale: string,
): string[] {
  const { neighbours, seed, units } = input;
  const total = neighbours.length;
  const nf = (n: number) => n.toLocaleString(`${locale}-IN`);

  if (total === 0) return [];

  const sentences: string[] = [];
  const base = {
    name: input.name,
    category: input.categoryName.toLowerCase(),
    area: input.area,
    total: nf(total + 1), // the neighbours plus this business
    radius: formatDistance(input.radiusKm * 1000, units),
  };

  sentences.push(fill(pick(group, 'lead', seed, 1), base));

  // Density. Only claimed when the two rings actually differ, so the page never says
  // "3 within 500 m and 3 within 1 km" — true, but reads as padding.
  const withDistance = neighbours.filter((n) => typeof n.distanceMeters === 'number');
  const near = withDistance.filter((n) => (n.distanceMeters as number) <= 500).length;
  const mid = withDistance.filter((n) => (n.distanceMeters as number) <= 1000).length;
  if (withDistance.length > 0 && mid > 0 && near !== mid) {
    sentences.push(
      fill(pick(group, 'density', seed, 2), {
        near: nf(near),
        mid: nf(mid),
        nearRadius: formatDistance(500, units),
        midRadius: formatDistance(1000, units),
      }),
    );
  }

  // The three closest, named, with their real distances — the part no two pages share.
  const closest = withDistance.slice(0, 3);
  if (closest.length > 0) {
    const list = closest
      .map((n) => `${n.name} (${formatDistance(n.distanceMeters as number, units)})`)
      .join(', ');
    sentences.push(fill(pick(group, 'nearest', seed, 3), { list }));
  }

  if (input.pincode) {
    sentences.push(fill(pick(group, 'pin', seed, 4), { pincode: input.pincode }));
  }

  return sentences.filter(Boolean);
}
