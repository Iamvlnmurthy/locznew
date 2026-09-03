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

/**
 * Every field is optional. Passages asserting things that are true or false of one business
 * rather than of the trade -- "round-the-clock care", "lower prices", "clean premises" -- were
 * removed from the data, which leaves 161 categories holding only some of the four. A category
 * with nothing safe left is absent entirely and its pages fall back to measured facts.
 */
export interface CategoryCopy {
  overview?: string;
  services?: string[];
  choosing?: string;
  practical?: string;
}

const CATEGORY_COPY = categoryText as Record<string, CategoryCopy>;

export interface DescribeInput {
  name: string;
  /** The page's language, so a tag in another script is not dropped into its prose. */
  locale: string;
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
  /** "a phone number", "a website", "published opening hours" -- in the page's language. */
  channelNames: { phone: string; website: string; hours: string };
  /**
   * The `businessDesc` message group for this page's language.
   *
   * Every sentence used to be an English template literal in this file, so a Hindi page rendered
   * Hindi chrome around English prose -- "LocZ maps 25 अस्पताल और क्लिनिक within 10.0 किमी" --
   * which reads as broken to a person and as mixed-language to a search engine. The frames live
   * in the message files now, numbered per family, and this is whichever set matches the page.
   */
  frames: Record<string, string>;
}

/**
 * Tags that belong in this page's sentences.
 *
 * The keyword data is mixed-script, so an English page produced "Jambu Bakers appears under
 * केक, bun and puff, at Jammu" -- Devanagari for "cake" inside an English clause. It reads as a
 * fault to a person and is a mixed-language signal to a search engine. Keep only the tags written
 * in the script the surrounding sentence is written in; a page with none left simply says where
 * the business is instead.
 */
const TELUGU = /[\u0C00-\u0C7F]/;
const DEVANAGARI = /[\u0900-\u097F]/;
/** Past Latin Extended-A, a tag is written in some other script. */
const NON_LATIN = /[^\u0000-\u024F]/;

function inScript(tags: string[], locale: string): string[] {
  const script = locale === 'te' ? TELUGU : locale === 'hi' ? DEVANAGARI : null;
  return tags.filter((tag) => {
    const foreign = NON_LATIN.test(tag);
    return script ? script.test(tag) || !foreign : !foreign;
  });
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Every `family1`, `family2`... in the message group, in order.
 *
 * Numbered keys rather than an array because getMessageGroup keeps only string values. English
 * carries more variants than Hindi and Telugu, which is deliberate -- a translated variant nobody
 * checked is worse than one fewer wording.
 */
function frameSet(frames: Record<string, string>, family: string): string[] {
  const out: string[] = [];
  for (let i = 1; ; i += 1) {
    const value = frames[`${family}${i}`];
    if (!value) break;
    out.push(value);
  }
  return out;
}

/** One frame from a family, chosen by the slug so the page reads the same on every crawl. */
function frame(
  frames: Record<string, string>,
  family: string,
  seed: string,
  salt: number,
  values: Record<string, string>,
): string {
  const options = frameSet(frames, family);
  if (options.length === 0) return '';
  const template = options[hash(`${seed}#${salt}#${family}`) % options.length];
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(value),
    template,
  );
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
/**
 * A service as a noun phrase.
 *
 * The category copy returns some items as verb phrases ("provides delivery", "sells biriyani"),
 * which is fine in a list and wrong once dropped into "Most of them deal in ...". Strip the
 * leading verb; what remains is the thing itself, which is what the sentence wants.
 */
function asNoun(item: string): string {
  return item
    .trim()
    .replace(
      /^(provides?|offers?|sells?|serves?|handles?|does|do|has|have|hosts?|supplies|stocks?|carries|deals? in)\s+/i,
      '',
    );
}

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
  const { seed, units, neighbours, frames } = input;
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
  const tags = inScript((input.keywords ?? []).filter(Boolean), input.locale)
    .slice(0, 3)
    .map(inSentence);
  opening.push(
    tags.length > 0
      ? frame(frames, 'listed', seed, 1, {
          name: input.name,
          area: input.area,
          tags: series(tags),
        })
      : frame(frames, 'listedPlain', seed, 1, {
          name: input.name,
          area: input.area,
          city: input.cityName,
        }),
  );
  paragraphs.push(opening.join(' ').trim());

  // 2. The neighbourhood -- measured, and different on every page.
  const measured = neighbours.filter(
    (n) => typeof n.distanceMeters === 'number' && (n.distanceMeters as number) > 0,
  );
  if (measured.length > 0) {
    const [innerRing, outerRing] = m.rings;
    const around: string[] = [
      frame(frames, 'count', seed, 2, {
        total: String(measured.length + 1),
        category: input.categoryName.toLowerCase(),
        radius: distance(input.radiusKm * 1000, units),
      }),
    ];
    // Only claimed when both rings hold something and they differ. Announcing "0 within 500 m"
    // is true but reads as a fault, and repeats verbatim across every sparsely-covered page.
    const near = measured.filter((n) => (n.distanceMeters as number) <= innerRing).length;
    const mid = measured.filter((n) => (n.distanceMeters as number) <= outerRing).length;
    const rings = {
      near: String(near),
      mid: String(mid),
      nearRadius: distance(innerRing, units),
      midRadius: distance(outerRing, units),
    };
    if (near > 0 && mid > near) {
      around.push(frame(frames, 'density', seed, 3, rings));
    } else if (mid === 1) {
      // "Within 1 km there are 1" is the kind of seam that tells a reader a machine wrote this.
      around.push(frame(frames, 'densityOne', seed, 3, rings));
    } else if (mid > 0) {
      around.push(frame(frames, 'densityMany', seed, 3, rings));
    }
    const closest = selectNeighbours(measured, m.pick, 3);
    // "The nearest are" is only true when the nearest are what was selected; every other window
    // says so plainly instead.
    around.push(
      frame(frames, m.pick === 'nearest' ? 'nearest' : 'among', seed, 4, {
        list: series(
          closest.map((n) => `${n.name} (${distance(n.distanceMeters as number, units)})`),
        ),
      }),
    );
    paragraphs.push(around.filter(Boolean).join(' '));
  }

  // 3. What this trade typically provides, and how to reach this one.
  const practical: string[] = [];
  if (copy?.services?.length && useServices) {
    // Rotating the slice keeps two shops of the same trade from reciting an identical list,
    // while every item stays true of the trade.
    const svc = copy.services;
    const start = hash(`${seed}#5`) % svc.length;
    const picked = Array.from(
      new Set([0, 1, 2, 3].map((i) => inSentence(asNoun(svc[(start + i) % svc.length])))),
    );
    practical.push(frame(frames, 'services', seed, 6, { picked: series(picked) }));
  }
  const channels: string[] = [];
  if (input.hasPhone) channels.push(input.channelNames.phone);
  if (input.hasWebsite) channels.push(input.channelNames.website);
  if (input.hasHours) channels.push(input.channelNames.hours);
  if (channels.length && m.channels) {
    practical.push(frame(frames, 'channels', seed, 7, { channels: series(channels) }));
  }
  if (copy?.practical && usePractical) practical.push(copy.practical);
  if (practical.length) paragraphs.push(practical.filter(Boolean).join(' '));

  // 4. Choosing between them -- only worth saying when there is a choice to make.
  const closing: string[] = [];
  if (copy?.choosing && useChoosing && measured.length > 0) closing.push(copy.choosing);
  if (input.pincode && m.pincode) {
    closing.push(frame(frames, 'pincode', seed, 8, { pincode: input.pincode }));
  }
  if (closing.length) paragraphs.push(closing.filter(Boolean).join(' '));

  const kept = paragraphs.filter((p) => p.trim().length > 0);
  // Some pages open on the neighbourhood instead of the listing line. Two pages that share their
  // opening sentence read as the same page even when the rest differs.
  if (!m.neighbourhoodFirst || kept.length < 2) return kept;
  return [kept[1], kept[0], ...kept.slice(2)];
}
