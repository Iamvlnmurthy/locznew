/**
 * The written body of a storefront page.
 *
 * Of 4,306,558 businesses, 5 carry a description. Everything else was a name, a phone number and
 * an address from the same open dataset (Overture Places) arranged by one template, which is how
 * two same-category pages came to share 42.8% of their exact phrasing and why Google answered a
 * search for one of them with "we have omitted some entries very similar to the 18 already
 * displayed".
 *
 * Text here comes from two places, and neither invents anything about a business:
 *
 *   Category copy, written once per category by a model that was never shown a business. A
 *   statement about a trade is true of every member of it ("ration shops carry sugar, rice and
 *   oil at subsidised rates"), so nothing is asserted about this shop that could be false.
 *
 *   Measured facts about this particular place: what it is listed as, where it sits, how many of
 *   its kind are nearby, which are closest and how far. These come from rows the page has already
 *   fetched for its similar-businesses strip, so they cost no query, and they differ per page by
 *   construction -- no two places have the same neighbours at the same distances.
 *
 * An owner's own description replaces all of it, which is the point of claiming a listing.
 */
import categoryText from '@/data/category-text.json';
import { matrixFor, selectNeighbours } from './content-matrix';

export interface CategoryCopy {
  overview: string;
  services: string[];
  choosing: string;
  practical: string;
}

const CATEGORY_COPY = categoryText as Record<string, CategoryCopy>;

export interface DescribeInput {
  name: string;
  categorySlug: string;
  categoryName: string;
  /** Overture's own tags for this business — real, and finer-grained than the category. */
  keywords?: string[] | null;
  area: string;
  cityName: string;
  pincode?: string | null;
  hasPhone: boolean;
  hasWebsite: boolean;
  hasHours: boolean;
  neighbours: Array<{ name: string; distanceMeters?: number }>;
  radiusKm: number;
  seed: string;
  units: { m: string; km: string };
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic pick, so a page's wording is identical on every crawl. */
function choose<T>(options: readonly T[], seed: string, salt: number): T {
  return options[hash(`${seed}#${salt}`) % options.length];
}

function distance(meters: number, units: { m: string; km: string }): string {
  return meters < 1000
    ? `${Math.max(1, Math.round(meters))} ${units.m}`
    : `${(meters / 1000).toFixed(1)} ${units.km}`;
}

function series(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Category copy arrives as list items ("Fresh vegetables and fruits"), which read as a typo once
 * dropped into the middle of a sentence. Lower-case the first letter unless the word is a proper
 * noun already capitalised further in (ATM, WhatsApp, Aadhaar).
 */
function inSentence(fragment: string): string {
  const trimmed = fragment.trim();
  if (!trimmed) return trimmed;
  if (/[A-Z]{2,}/.test(trimmed) || /\s[A-Z]/.test(trimmed.slice(1))) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/**
 * Paragraphs for the page. Empty when there is genuinely nothing to say: a page with no category
 * copy and no neighbours stays short rather than padding, because padding is what produced
 * identical pages in the first place.
 */
export function describeBusiness(input: DescribeInput): string[] {
  const copy = CATEGORY_COPY[input.categorySlug];
  const { seed, units, neighbours } = input;
  const paragraphs: string[] = [];

  // Which version of this page this business gets -- see content-matrix.ts. The axes that matter
  // choose what the page says (which neighbours it names, which radii it counts, which optional
  // lines it carries), not only how it words it, because two businesses in one cluster are handed
  // the same neighbours and would otherwise state the same facts however they were phrased.
  const m = matrixFor(seed, copy ? 4 : 0);
  const useOverview = m.categorySlot === 0;
  const useServices = m.categorySlot === 1 && m.services;
  const usePractical = m.categorySlot === 2;
  const useChoosing = m.categorySlot === 3;

  // 1. What this kind of place does, then what this one is listed as.
  const opening: string[] = [];
  if (copy?.overview && useOverview) opening.push(copy.overview);
  const tags = (input.keywords ?? []).filter(Boolean).slice(0, 3).map(inSentence);
  opening.push(
    tags.length > 0
      ? choose(
          [
            `${input.name} is listed in ${input.area} under ${series(tags)}.`,
            `On LocZ, ${input.name} is recorded at ${input.area} as ${series(tags)}.`,
            `${input.name} appears under ${series(tags)}, at ${input.area}.`,
            `At ${input.area}, ${input.name} is catalogued as ${series(tags)}.`,
            `${input.name} carries the tags ${series(tags)} and is placed at ${input.area}.`,
            `The record for ${input.name} sits at ${input.area}, filed under ${series(tags)}.`,
            `Filed under ${series(tags)}, ${input.name} is located at ${input.area}.`,
            `${input.name}, at ${input.area}, is indexed as ${series(tags)}.`,
          ],
          seed,
          1,
        )
      : choose(
          [
            `${input.name} is listed at ${input.area}, ${input.cityName}.`,
            `${input.name} sits at ${input.area} in ${input.cityName}.`,
            `The address on record for ${input.name} is ${input.area}, ${input.cityName}.`,
            `In ${input.cityName}, ${input.name} is placed at ${input.area}.`,
            `${input.name} is recorded at ${input.area}, ${input.cityName}.`,
            `LocZ holds ${input.name} at ${input.area} in ${input.cityName}.`,
          ],
          seed,
          1,
        ),
  );
  paragraphs.push(opening.join(' '));

  // 2. The neighbourhood — measured, and different on every page.
  const measured = neighbours.filter(
    (n) => typeof n.distanceMeters === 'number' && (n.distanceMeters as number) > 0,
  );
  if (measured.length > 0) {
    const around: string[] = [
      choose(
        [
          `LocZ maps ${measured.length + 1} ${input.categoryName.toLowerCase()} within ${distance(input.radiusKm * 1000, units)} of here.`,
          `Counting this one, ${measured.length + 1} ${input.categoryName.toLowerCase()} are recorded within ${distance(input.radiusKm * 1000, units)}.`,
          `There are ${measured.length + 1} ${input.categoryName.toLowerCase()} on LocZ inside ${distance(input.radiusKm * 1000, units)} of this address.`,
          `Within ${distance(input.radiusKm * 1000, units)} of this spot LocZ lists ${measured.length + 1} ${input.categoryName.toLowerCase()}.`,
          `${measured.length + 1} ${input.categoryName.toLowerCase()} appear on LocZ inside a ${distance(input.radiusKm * 1000, units)} radius.`,
          `Search ${distance(input.radiusKm * 1000, units)} around this address and LocZ shows ${measured.length + 1} ${input.categoryName.toLowerCase()}.`,
          `This is one of ${measured.length + 1} ${input.categoryName.toLowerCase()} LocZ holds within ${distance(input.radiusKm * 1000, units)}.`,
          `LocZ has ${measured.length + 1} ${input.categoryName.toLowerCase()} on record inside ${distance(input.radiusKm * 1000, units)} of here.`,
        ],
        seed,
        2,
      ),
    ];
    // Only claimed when both rings hold something and they differ. Announcing "0 within 500 m"
    // is true but reads as a fault, and repeats verbatim across every sparsely-covered page.
    const [innerRing, outerRing] = m.rings;
    const near = measured.filter((n) => (n.distanceMeters as number) <= innerRing).length;
    const mid = measured.filter((n) => (n.distanceMeters as number) <= outerRing).length;
    if (near > 0 && mid > near) {
      around.push(
        choose(
          [
            `${near} fall within ${distance(innerRing, units)}, ${mid} within ${distance(outerRing, units)}.`,
            `Inside ${distance(innerRing, units)} there are ${near}; by ${distance(outerRing, units)} the count is ${mid}.`,
            `${near} of them sit inside ${distance(innerRing, units)}, rising to ${mid} at ${distance(outerRing, units)}.`,
            `Walk ${distance(innerRing, units)} and you pass ${near}; stretch to ${distance(outerRing, units)} and it is ${mid}.`,
            `Close in, ${near} are within ${distance(innerRing, units)}; ${mid} within ${distance(outerRing, units)}.`,
            `The nearest ${distance(innerRing, units)} holds ${near}, and ${distance(outerRing, units)} holds ${mid}.`,
          ],
          seed,
          3,
        ),
      );
    } else if (mid > 0) {
      // "Within 1 km there are 1" is the kind of seam that tells a reader a machine wrote this,
      // and one business inside the ring is common enough to be worth the agreement.
      around.push(
        mid === 1
          ? choose(
              [
                `One of them is within ${distance(outerRing, units)}.`,
                `Just one sits inside ${distance(outerRing, units)}.`,
                `Only one other is inside ${distance(outerRing, units)}.`,
                `A single one falls within ${distance(outerRing, units)}.`,
                `Within ${distance(outerRing, units)} there is one other.`,
              ],
              seed,
              3,
            )
          : choose(
              [
                `${mid} of them are within ${distance(outerRing, units)}.`,
                `Within ${distance(outerRing, units)} there are ${mid}.`,
                `${mid} sit inside ${distance(outerRing, units)} of here.`,
                `That count is ${mid} within ${distance(outerRing, units)}.`,
                `Inside ${distance(outerRing, units)} the number is ${mid}.`,
              ],
              seed,
              3,
            ),
      );
    }
    const closest = selectNeighbours(measured, m.pick, 3);
    around.push(
      choose(
        [
          `${m.pick === 'nearest' ? 'The nearest are' : 'Among them are'} ${series(closest.map((n) => `${n.name} (${distance(n.distanceMeters as number, units)})`))}.`,
          `${m.pick === 'nearest' ? 'Closest by distance' : 'Also in range'}: ${series(closest.map((n) => `${n.name} at ${distance(n.distanceMeters as number, units)}`))}.`,
          `Nearby, in order: ${series(closest.map((n) => `${n.name} at ${distance(n.distanceMeters as number, units)}`))}.`,
          `A few of them: ${series(closest.map((n) => `${n.name} (${distance(n.distanceMeters as number, units)})`))}.`,
          `Working outwards, ${series(closest.map((n) => `${n.name} at ${distance(n.distanceMeters as number, units)}`))}.`,
          `${series(closest.map((n) => `${n.name} (${distance(n.distanceMeters as number, units)})`))} are among them.`,
          `In the surrounding streets: ${series(closest.map((n) => `${n.name} (${distance(n.distanceMeters as number, units)})`))}.`,
        ],
        seed,
        4,
      ),
    );
    paragraphs.push(around.join(' '));
  }

  // 3. What this trade typically provides, and how to reach this one.
  const practical: string[] = [];
  if (copy?.services?.length && useServices) {
    // Rotating the slice keeps two shops of the same trade from reciting an identical list,
    // while every item stays true of the trade.
    const start = hash(`${seed}#5`) % copy.services.length;
    const picked = Array.from(
      new Set(
        [0, 1, 2, 3].map((i) => inSentence(copy.services[(start + i) % copy.services.length])),
      ),
    );
    practical.push(
      choose(
        [
          `Places of this kind usually handle ${series(picked)}.`,
          `Expect ${series(picked)} from this kind of establishment.`,
          `Typically on offer here: ${series(picked)}.`,
          `A place like this generally covers ${series(picked)}.`,
          `Most of them deal in ${series(picked)}.`,
          `The usual list runs to ${series(picked)}.`,
        ],
        seed,
        6,
      ),
    );
  }
  const channels: string[] = [];
  if (input.hasPhone) channels.push('a phone number');
  if (input.hasWebsite) channels.push('a website');
  if (input.hasHours) channels.push('published opening hours');
  if (channels.length && m.channels) practical.push(`This listing carries ${series(channels)}.`);
  if (copy?.practical && usePractical) practical.push(copy.practical);
  if (practical.length) paragraphs.push(practical.join(' '));

  // 4. Choosing between them — only worth saying when there is a choice to make.
  if ((input.pincode && m.pincode) || (copy?.choosing && useChoosing && measured.length > 0)) {
    const closing: string[] = [];
    if (copy?.choosing && useChoosing && measured.length > 0) closing.push(copy.choosing);
    if (input.pincode && m.pincode) {
      closing.push(
        choose(
          [
            `The address falls under pincode ${input.pincode}.`,
            `Postal code here is ${input.pincode}.`,
            `This block comes under pincode ${input.pincode}.`,
            `Post reaches this address on ${input.pincode}.`,
            `The pincode for the area is ${input.pincode}.`,
          ],
          seed,
          8,
        ),
      );
    }
    paragraphs.push(closing.join(' '));
  }

  const kept = paragraphs.filter((p) => p.trim().length > 0);
  // Some pages open on the neighbourhood instead of the listing line. Two pages that share their
  // opening sentence read as the same page even when the rest differs.
  if (!m.neighbourhoodFirst || kept.length < 2) return kept;
  return [kept[1], kept[0], ...kept.slice(2)];
}
