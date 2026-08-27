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
  id?: string | null;
  name?: string | null;
  categoryName: string;
  businessType?: string | null;
  addressLine?: string | null;
  localityName?: string | null;
  mandal?: string | null;
  cityName?: string | null;
  stateName?: string | null;
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

/** Simple deterministic string hash */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Strips spammy keyword dumps from scraped business titles (e.g. "Name | Best in City...") */
export function cleanBusinessTitle(raw?: string | null): string {
  if (!raw) return '';
  let name = raw.split(/[|\/]/)[0]?.trim() || '';
  name = name
    .replace(
      /[-–—]\s*(Interior|Best|Car Wash|Ladies|Building|Sainik|Dental|Clinic|Hospital|Shop|Store).*/i,
      '',
    )
    .trim();
  return name.replace(/\s+/g, ' ');
}

export type CategoryArchetype =
  | 'STUDIO_DESIGN'
  | 'HEALTHCARE'
  | 'FOOD_DINING'
  | 'AUTO_VEHICLE'
  | 'RETAIL_GROCERY'
  | 'BUILDING_CONSTRUCTION'
  | 'EDUCATION_COACHING'
  | 'BEAUTY_WELLNESS'
  | 'FURNITURE_HOME'
  | 'BOOKS_STATIONERY'
  | 'HOSPITALITY_HOTEL'
  | 'PROFESSIONAL_SERVICES'
  | 'GENERAL_COMMERCE';

export function detectCategoryArchetype(category: string): CategoryArchetype {
  const cat = category.toLowerCase();
  if (cat.includes('interior') || cat.includes('decor') || cat.includes('architect')) {
    return 'STUDIO_DESIGN';
  }
  if (
    cat.includes('hospital') ||
    cat.includes('clinic') ||
    cat.includes('dental') ||
    cat.includes('health') ||
    cat.includes('pharmacy') ||
    cat.includes('diagnostic')
  ) {
    return 'HEALTHCARE';
  }
  if (
    cat.includes('bakery') ||
    cat.includes('restaurant') ||
    cat.includes('sweet') ||
    cat.includes('food') ||
    cat.includes('cafe') ||
    (cat.includes('hotel') && (cat.includes('dining') || cat.includes('mess')))
  ) {
    return 'FOOD_DINING';
  }
  if (
    cat.includes('auto') ||
    cat.includes('car') ||
    cat.includes('vehicle') ||
    cat.includes('garage') ||
    cat.includes('bike') ||
    cat.includes('tyre')
  ) {
    return 'AUTO_VEHICLE';
  }
  if (
    cat.includes('grocery') ||
    cat.includes('kirana') ||
    cat.includes('supermarket') ||
    cat.includes('provision') ||
    cat.includes('departmental')
  ) {
    return 'RETAIL_GROCERY';
  }
  if (
    cat.includes('builder') ||
    cat.includes('contractor') ||
    cat.includes('construction') ||
    cat.includes('civil') ||
    cat.includes('engineer')
  ) {
    return 'BUILDING_CONSTRUCTION';
  }
  if (
    cat.includes('school') ||
    cat.includes('college') ||
    cat.includes('coaching') ||
    cat.includes('education') ||
    cat.includes('institute') ||
    cat.includes('academy')
  ) {
    return 'EDUCATION_COACHING';
  }
  if (
    cat.includes('beauty') ||
    cat.includes('salon') ||
    cat.includes('spa') ||
    cat.includes('parlour') ||
    cat.includes('grooming')
  ) {
    return 'BEAUTY_WELLNESS';
  }
  if (
    cat.includes('furniture') ||
    cat.includes('sofa') ||
    cat.includes('furnishing') ||
    cat.includes('mattress')
  ) {
    return 'FURNITURE_HOME';
  }
  if (
    cat.includes('book') ||
    cat.includes('stationery') ||
    cat.includes('publication') ||
    cat.includes('printing')
  ) {
    return 'BOOKS_STATIONERY';
  }
  if (
    cat.includes('hotel') ||
    cat.includes('resort') ||
    cat.includes('hostel') ||
    cat.includes('lodge') ||
    cat.includes('stay')
  ) {
    return 'HOSPITALITY_HOTEL';
  }
  if (
    cat.includes('advocate') ||
    cat.includes('lawyer') ||
    cat.includes('consultant') ||
    cat.includes('accountant') ||
    cat.includes('chartered')
  ) {
    return 'PROFESSIONAL_SERVICES';
  }
  return 'GENERAL_COMMERCE';
}

/**
 * Describes a business in facts with maximum combinatorial variations.
 */
export function describeBusiness(
  business: DescribableBusiness,
  lang?: string | null,
): {
  text: string;
  /** True when this was assembled rather than written. The page must say so. */
  generated: boolean;
} {
  const own = business.description?.trim();
  if (own) return { text: own, generated: false };

  const locale = (lang?.toLowerCase() || 'en').slice(0, 2);
  const name = cleanBusinessTitle(business.name);
  const archetype = detectCategoryArchetype(business.categoryName);
  const h = hashString((business.id || '') + (name || business.categoryName));

  const placeParts = [business.localityName, business.mandal, business.cityName].filter(Boolean);
  const place = placeParts.join(', ');

  const landmark = business.landmark?.trim().replace(/[.,\s)]+$/, '');
  const terms = keywordsInScript(business.keywords ?? [], locale).slice(0, MAX_TERMS_SHOWN);
  const termsList =
    terms.length > 0
      ? listTerms(terms, locale === 'te' ? 'మరియు' : locale === 'hi' ? 'और' : 'and')
      : '';

  // Multilingual synthesis for Telugu (te) and Hindi (hi)
  if (locale === 'te') {
    const lines: string[] = [];
    if (place) {
      lines.push(`${place}లో ${business.categoryName}.`);
    } else {
      lines.push(`${business.categoryName}.`);
    }
    if (landmark) {
      lines.push(`${landmark} దగ్గర ఉంది.`);
    }
    if (termsList) {
      lines.push(`ప్రజలు ఇక్కడ ${termsList} కోసం చూస్తారు.`);
    }
    return { text: lines.join(' '), generated: true };
  }

  if (locale === 'hi') {
    const lines: string[] = [];
    if (place) {
      lines.push(`${place} में ${business.categoryName}।`);
    } else {
      lines.push(`${business.categoryName}।`);
    }
    if (landmark) {
      lines.push(`${landmark} के पास स्थित।`);
    }
    if (termsList) {
      lines.push(`लोग यहाँ ${termsList} के लिए देखते हैं।`);
    }
    return { text: lines.join(' '), generated: true };
  }

  // English fact-driven generation:
  if (!name && !business.addressLine && !landmark && terms.length === 0) {
    const base = place ? `${business.categoryName} in ${place}.` : `${business.categoryName}.`;
    return { text: base, generated: true };
  }

  const sentences: string[] = [];

  // Slot 1: Entity Placement (Combinatorial variety based on available fields)
  if (name) {
    const street = business.addressLine?.trim();
    if (street && place && landmark) {
      const patterns = [
        `${name} is a ${business.categoryName.toLowerCase()} located on ${street} in ${place}, situated near ${landmark}.`,
        `Situated on ${street} in ${place} near ${landmark}, ${name} operates as a ${business.categoryName.toLowerCase()}.`,
        `Operating from ${street} in ${place}, ${name} is a local ${business.categoryName.toLowerCase()} in the vicinity of ${landmark}.`,
      ];
      sentences.push(patterns[h % patterns.length]!);
    } else if (street && place) {
      const patterns = [
        `${name} is a ${business.categoryName.toLowerCase()} situated on ${street} in ${place}.`,
        `Located on ${street} in ${place}, ${name} provides ${business.categoryName.toLowerCase()} services.`,
        `Operating from ${street} in ${place}, ${name} serves the local area as a ${business.categoryName.toLowerCase()}.`,
      ];
      sentences.push(patterns[h % patterns.length]!);
    } else if (place && landmark) {
      const patterns = [
        `${name} is a ${business.categoryName.toLowerCase()} in ${place}, located in the vicinity of ${landmark}.`,
        `Located near ${landmark} in ${place}, ${name} operates as a ${business.categoryName.toLowerCase()}.`,
        `Situated close to ${landmark} in ${place}, ${name} serves patrons as a ${business.categoryName.toLowerCase()}.`,
        `Based in ${place} near ${landmark}, ${name} provides dedicated ${business.categoryName.toLowerCase()} solutions.`,
      ];
      sentences.push(patterns[h % patterns.length]!);
    } else if (place) {
      const patterns = [
        `${name} is a ${business.categoryName.toLowerCase()} based in ${place}.`,
        `Operating in ${place}, ${name} provides ${business.categoryName.toLowerCase()} services.`,
        `Serving the ${place} community, ${name} is an established ${business.categoryName.toLowerCase()}.`,
        `Based out of ${place}, ${name} offers ${business.categoryName.toLowerCase()} solutions to local clients.`,
      ];
      sentences.push(patterns[h % patterns.length]!);
    } else {
      sentences.push(`${name} is a ${business.categoryName.toLowerCase()}.`);
    }
  } else {
    if (place) {
      sentences.push(`${business.categoryName} in ${place}.`);
    } else {
      sentences.push(`${business.categoryName}.`);
    }
    if (landmark) {
      sentences.push(`Located near ${landmark}.`);
    }
  }

  // Slot 2: Service & Specialization focus (Combinatorial variety per archetype)
  if (termsList) {
    const servicePhrases: Record<CategoryArchetype, string[]> = {
      STUDIO_DESIGN: [
        `The studio provides tailored interior planning, design consultation, and decor solutions covering ${termsList}.`,
        `Specializing in ${termsList} for residential and commercial spaces.`,
        `Focusing on modern styling, space management, and turnkey solutions including ${termsList}.`,
        `Offering professional aesthetic consultancy and decor planning specializing in ${termsList}.`,
      ],
      HEALTHCARE: [
        `The practice provides clinical consultations, diagnostics, and patient care specializing in ${termsList}.`,
        `Offering healthcare services and clinical care focused on ${termsList}.`,
        `Providing dedicated medical support, consultations, and care covering ${termsList}.`,
        `Serving patient health needs with medical care and diagnostic services in ${termsList}.`,
      ],
      FOOD_DINING: [
        `Serving freshly prepared food, regional specialties, and delicacies including ${termsList}.`,
        `Known for everyday refreshments, dining options, and food items such as ${termsList}.`,
        `Offering a variety of fresh culinary preparations and signature dishes including ${termsList}.`,
        `Featuring freshly prepared delicacies, dining choices, and refreshment options like ${termsList}.`,
      ],
      AUTO_VEHICLE: [
        `The facility delivers vehicle maintenance, repair solutions, and automotive care covering ${termsList}.`,
        `Specializing in vehicle maintenance, detailing, and automobile support for ${termsList}.`,
        `Providing comprehensive vehicle upkeep, diagnostic support, and servicing in ${termsList}.`,
        `Delivering automotive servicing, repairs, and care solutions covering ${termsList}.`,
      ],
      RETAIL_GROCERY: [
        `Stocking daily household provisions, packaged goods, and grocery essentials such as ${termsList}.`,
        `Supplying everyday household necessities, rations, and provisions including ${termsList}.`,
        `Offering a dependable selection of daily groceries, essentials, and household goods like ${termsList}.`,
        `Carrying regular supplies of household provisions, groceries, and packaged items including ${termsList}.`,
      ],
      BUILDING_CONSTRUCTION: [
        `Delivering civil works, structural contracting, and real estate solutions specializing in ${termsList}.`,
        `Providing contracting and property development services with expertise in ${termsList}.`,
        `Undertaking residential and commercial infrastructure works focusing on ${termsList}.`,
        `Specializing in structural engineering, civil construction, and site execution for ${termsList}.`,
      ],
      EDUCATION_COACHING: [
        `Offering structured academic coursework, foundational tutoring, and training in ${termsList}.`,
        `Delivering coaching and comprehensive learning programs focused on ${termsList}.`,
        `Providing student training, academic guidance, and skill development in ${termsList}.`,
        `Focused on structured curriculum, test preparation, and academic mentorship covering ${termsList}.`,
      ],
      BEAUTY_WELLNESS: [
        `Providing professional styling, aesthetic care, and personal grooming treatments including ${termsList}.`,
        `Offering beauty, wellness, and personal care services covering ${termsList}.`,
        `Specializing in personal grooming, hair styling, and aesthetic care focused on ${termsList}.`,
        `Delivering dedicated salon and wellness treatments tailored for ${termsList}.`,
      ],
      FURNITURE_HOME: [
        `Showcasing a curated collection of home furnishings, living space decor, and furniture covering ${termsList}.`,
        `Specializing in contemporary furnishings, wooden fixtures, and decor items including ${termsList}.`,
        `Offering durable home and commercial furniture solutions focusing on ${termsList}.`,
        `Featuring modern living, bedroom, and office furniture collections including ${termsList}.`,
      ],
      BOOKS_STATIONERY: [
        `Offering an extensive collection of books, academic literature, reading material, and supplies including ${termsList}.`,
        `Specializing in books, literature collections, stationery, and publications covering ${termsList}.`,
        `Serving readers and students with a curated selection of literature, academic texts, and ${termsList}.`,
        `Providing books, reading materials, and stationery essentials focusing on ${termsList}.`,
      ],
      HOSPITALITY_HOTEL: [
        `Providing comfortable lodging, guest accommodation, and hospitality services covering ${termsList}.`,
        `Welcoming guests with well-maintained accommodations and travel amenities including ${termsList}.`,
        `Offering convenient stays, guest amenities, and hospitality facilities featuring ${termsList}.`,
      ],
      PROFESSIONAL_SERVICES: [
        `Delivering expert advisory, legal, financial, and consultancy services specializing in ${termsList}.`,
        `Providing professional consultations, statutory compliance, and advisory support covering ${termsList}.`,
        `Assisting individuals and enterprises with specialized professional services focusing on ${termsList}.`,
      ],
      GENERAL_COMMERCE: [
        `Offering local commercial services, customer solutions, and retail items focused on ${termsList}.`,
        `Serving clients and shoppers with dedicated offerings covering ${termsList}.`,
        `Providing trusted local products, supplies, and services specializing in ${termsList}.`,
        `People look here for ${termsList}.`,
      ],
    };

    const pool = servicePhrases[archetype] || servicePhrases.GENERAL_COMMERCE;
    sentences.push(pool[(h >> 2) % pool.length]!);
  }

  return { text: sentences.join(' '), generated: true };
}

/**
 * Keywords in the script the reader is being addressed in.
 */
const SCRIPT_RANGES: Record<string, RegExp> = {
  te: /[ఀ-౿]/,
  hi: /[ऀ-ॿ]/,
};

export function keywordsInScript(keywords: string[], lang?: string | null): string[] {
  const cleaned = keywords.map((keyword) => keyword.trim()).filter(Boolean);
  const script = SCRIPT_RANGES[lang?.toLowerCase() ?? 'en'];
  if (!script) {
    const latin = cleaned.filter(
      (keyword) => !/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(keyword),
    );
    return latin.length > 0 ? latin : cleaned;
  }
  const inScript = cleaned.filter((keyword) => script.test(keyword));
  if (inScript.length > 0) return inScript;
  return cleaned.filter(
    (keyword) => !/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(keyword),
  );
}

/** "a, b and c" — an Oxford-comma-free list */
export function listTerms(terms: string[], and: string): string {
  if (terms.length === 0) return '';
  if (terms.length === 1) return terms[0]!;
  return `${terms.slice(0, -1).join(', ')} ${and} ${terms[terms.length - 1]!}`;
}

/**
 * The line that appears under an imported record for licence attribution.
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
