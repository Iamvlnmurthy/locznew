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
  /** A nearby landmark from the address, when known — a fact, never invented. */
  landmark?: string | null;
  /**
   * The six-digit pincode. Held for the address block and the structured data, and
   * deliberately never written into the prose — see below.
   */
  pincode?: string | null;
  /** What the shop is searched for. Real demand once the learning system has any. */
  keywords?: string[];
  /** The owner's own words. When present nothing here is used at all. */
  description?: string | null;
}

/** Enough terms to be useful, few enough to read as a sentence rather than a keyword dump. */
const MAX_TERMS_SHOWN = 6;

/**
 * The sentence frames, per language.
 *
 * Localising the category and city names was only half the job: it produced "కిరాణా దుకాణాలు
 * in Muzaffarpur", a Telugu noun in an English sentence. The words *between* the names carry
 * the language too.
 *
 * Word order is not English word order. Telugu and Hindi both put the place before the thing
 * — "{place}లో {category}", not "{category} in {place}" — so these are whole frames rather
 * than a translated preposition dropped into an English skeleton. Hindi ends a sentence with
 * a danda, not a full stop.
 */
interface DescriptionPhrases {
  /** Category and place. `{category}` and `{place}` are substituted. */
  inPlace: (category: string, place: string) => string;
  /** Category alone, when there is no place at all. */
  categoryOnly: (category: string) => string;
  /** The landmark line. */
  near: (landmark: string) => string;
  /** What people search this shop for. */
  soughtFor: (terms: string) => string;
  /** Joins the last two items of a list. */
  and: string;
}

const PHRASES: Record<string, DescriptionPhrases> = {
  en: {
    inPlace: (category, place) => `${category} in ${place}.`,
    categoryOnly: (category) => `${category}.`,
    near: (landmark) => `Located near ${landmark}.`,
    soughtFor: (terms) => `People look here for ${terms}.`,
    and: 'and',
  },
  te: {
    inPlace: (category, place) => `${place}లో ${category}.`,
    categoryOnly: (category) => `${category}.`,
    near: (landmark) => `${landmark} దగ్గర ఉంది.`,
    soughtFor: (terms) => `ప్రజలు ఇక్కడ ${terms} కోసం చూస్తారు.`,
    and: 'మరియు',
  },
  hi: {
    inPlace: (category, place) => `${place} में ${category}।`,
    categoryOnly: (category) => `${category}।`,
    near: (landmark) => `${landmark} के पास स्थित।`,
    soughtFor: (terms) => `लोग यहाँ ${terms} के लिए देखते हैं।`,
    and: 'और',
  },
};

function phrasesFor(lang?: string | null): DescriptionPhrases {
  return PHRASES[lang?.toLowerCase() ?? 'en'] ?? PHRASES.en!;
}

/**
 * Describes a business in facts.
 *
 * Returns the owner's description untouched when there is one — a claimed business speaks for
 * itself, and generated text must never sit on top of what somebody actually wrote.
 */
export function describeBusiness(
  business: DescribableBusiness,
  lang?: string | null,
): {
  text: string;
  /** True when this was assembled rather than written. The page must say so. */
  generated: boolean;
} {
  const phrases = phrasesFor(lang);
  const own = business.description?.trim();
  if (own) return { text: own, generated: false };

  const lines: string[] = [];

  // "Kirana store in Madhapur, Hyderabad." — the one line that is always available, because
  // category and city are required columns.
  const place = [business.localityName, business.cityName].filter(Boolean).join(', ');
  lines.push(
    place
      ? phrases.inPlace(business.categoryName, place)
      : phrases.categoryOnly(business.categoryName),
  );

  // "Located near Inorbit Mall." — a fact from the address, so it places the business more
  // precisely without making any claim about it. This is how people actually navigate to a
  // place: by what is next to it, not by its coordinates.
  //
  // The pincode used to be appended here as "in the 500081 area". It is gone on purpose. A
  // six-digit number is not how anyone describes where a shop is, it was the only thing many
  // of these lines contained, and because every record has one it produced the same filler
  // sentence on millions of pages — the exact repetition that makes a page look worthless to
  // a reader and to a search engine. The pincode is still shown in the address block and in
  // the structured data, which is where a postcode belongs.
  if (business.landmark) lines.push(phrases.near(business.landmark));

  const terms = (business.keywords ?? [])
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, MAX_TERMS_SHOWN);

  if (terms.length > 0) {
    // Hedged on purpose. These come from the category vocabulary and from what people search,
    // not from the shop confirming it stocks any particular thing.
    lines.push(phrases.soughtFor(listTerms(terms, phrases.and)));
  }

  return { text: lines.join(' '), generated: true };
}

/** "a, b and c" — an Oxford-comma-free list, which is how the rest of the product reads. */
function listTerms(terms: string[], and: string): string {
  if (terms.length === 1) return terms[0]!;
  return `${terms.slice(0, -1).join(', ')} ${and} ${terms[terms.length - 1]!}`;
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
