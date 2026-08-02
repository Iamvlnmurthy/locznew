/**
 * The text shown on a business that has never written any.
 *
 * Four million imported records have a name, a category and a location, and nothing else. The
 * obvious fix is to generate friendly prose — "a well-loved neighbourhood store known for its
 * wide selection" — and it is the wrong fix. That is a claim about a real, named, findable
 * business that the business never made, published on a page they cannot correct until they
 * claim it. When it is wrong, the shopkeeper's first experience of LocZ is something we
 * invented about them.
 *
 * So every line here is assembled from data we actually hold, and none of it is written in
 * the shop's voice. It fills the same space on the page and it is all defensible.
 *
 * Deliberately not stored. This is a view of the record, not a fact about it — writing it to
 * the description column would make invented text indistinguishable from what an owner typed,
 * and the moment they claim the business their own words must simply replace it.
 */

export interface DescribableBusiness {
  categoryName: string;
  businessType?: string | null;
  localityName?: string | null;
  cityName?: string | null;
  /** What the shop is searched for. Real demand once the learning system has any. */
  keywords?: string[];
  /** The owner's own words. When present nothing here is used at all. */
  description?: string | null;
}

/** Enough terms to be useful, few enough to read as a sentence rather than a keyword dump. */
const MAX_TERMS_SHOWN = 6;

/**
 * Describes a business in facts.
 *
 * Returns the owner's description untouched when there is one — a claimed business speaks for
 * itself, and generated text must never sit on top of what somebody actually wrote.
 */
export function describeBusiness(business: DescribableBusiness): {
  text: string;
  /** True when this was assembled rather than written. The page must say so. */
  generated: boolean;
} {
  const own = business.description?.trim();
  if (own) return { text: own, generated: false };

  const lines: string[] = [];

  // "Kirana store in Madhapur, Hyderabad." — the one line that is always available, because
  // category and city are required columns.
  const place = [business.localityName, business.cityName].filter(Boolean).join(', ');
  lines.push(place ? `${business.categoryName} in ${place}.` : `${business.categoryName}.`);

  const terms = (business.keywords ?? [])
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, MAX_TERMS_SHOWN);

  if (terms.length > 0) {
    // Hedged on purpose. These come from the category vocabulary and from what people search,
    // not from the shop confirming it stocks any particular thing.
    lines.push(`People look here for ${listTerms(terms)}.`);
  }

  return { text: lines.join(' '), generated: true };
}

/** "a, b and c" — an Oxford-comma-free list, which is how the rest of the product reads. */
function listTerms(terms: string[]): string {
  if (terms.length === 1) return terms[0]!;
  return `${terms.slice(0, -1).join(', ')} and ${terms[terms.length - 1]!}`;
}

/**
 * The line that has to appear under an imported record.
 *
 * Not presentation polish. ODbL and CDLA both require attribution to travel with the data, so
 * a page that renders the record without this is using it outside its licence. Returns null
 * for anything a person created, which needs no attribution at all.
 */
export function attributionFor(business: {
  sourceName?: string | null;
  licenceName?: string | null;
  attributionText?: string | null;
}): string | null {
  if (business.attributionText?.trim()) return business.attributionText.trim();
  if (!business.sourceName) return null;

  return business.licenceName
    ? `Details from ${business.sourceName}, licensed under ${business.licenceName}.`
    : `Details from ${business.sourceName}.`;
}
