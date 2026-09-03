import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import type { ListingSummary } from '@locz/shared-types';
import { publicBrandLogo } from '@locz/public-brands';
import { Icon } from '@/components/icons';
import { ListingCard } from '@/components/listing-card';
import { getMessageGroup, getTranslator } from '@/i18n';
import { ApiError, SITE_URL, api, apiSafe } from '@/lib/api';
import { premiumBusinessBanner } from '@/lib/premium-banner-catalog';
import { getCurrentUser, getLocale, localizedAlternates } from '@/lib/session';
import { premiumCategoryArtwork } from '@/lib/premium-icon-catalog';
import { BusinessEnquiry } from './business-enquiry';
import { ShareBusiness } from './share-business';
import { BusinessBackButton } from './back-button';
import { describeBusiness } from './business-description';
import { buildStorefrontJsonLd } from './storefront-jsonld';
import { AdSlot } from '@/components/ad-slot';
import { StorefrontHouseAd } from '@/components/storefront-house-ad';
import { BusinessActionTracker } from '@/components/business-action-tracker';
import { StorefrontTabs } from './storefront-tabs';
import { BankingDetails } from './banking-details';
import { PostOfficeDetails } from './post-office-details';
import { RailwayDetails } from './railway-details';
import { BookmarkBusiness } from './bookmark-business';

export interface BusinessHour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

interface SimilarBusiness {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  pincode: string | null;
  distanceMeters?: number;
  verificationStatus: string;
  logoUrl?: string | null;
  publicBrandKey?: string | null;
}

export interface BusinessDetail {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  categoryId: string;
  cityName: string;
  cityId: string;
  localityName: string | null;
  landmark: string | null;
  /** The state, and the sub-district. Absent on older API builds. */
  stateName?: string | null;
  citySlug: string;
  categorySlug: string;
  /** The category's parent, for artwork lookup. Absent on older API builds. */
  parentCategoryName?: string | null;
  mandal?: string | null;
  /** Public profiles elsewhere, emitted as schema.org sameAs. Absent on older API builds. */
  socialLinks?: string[] | null;
  /** Short public reference, e.g. "000J-HRCF". Absent on older API builds. */
  loczId?: string | null;
  pincode: string | null;
  logoUrl: string | null;
  publicBrandKey: string | null;
  isClaimable?: boolean;
  description: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  primaryPhone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  website: string | null;
  sourceName?: string | null;
  verifiedAt?: string | null;
  updatedAt?: string | null;
  verificationStatus: string;
  hours: BusinessHour[];
  listingCount: number;
  viewCount: number;
  isOwner: boolean;
  createdAt: string;
  /** True when the API composed the description from the record rather than the owner writing it. */
  descriptionIsGenerated: boolean;
  /** Required under the source licence for an imported record. Null for anything a person made. */
  attribution: string | null;
  claimStatus: string;
  keywords: string[];
  /** Authoritative RBI IFSC banking data — present only on bank/ATM pages, null otherwise. */
  banking: BankingInfo | null;
  /** Authoritative India Post details — present only on post-office pages, null otherwise. */
  postOffice: PostOfficeInfo | null;
  /** Station code + trains — present only on railway-station pages, null otherwise. */
  railway: RailwayInfo | null;
  /** True when the category is under the "Public Services" tree — page reads as info, not a shop. */
  isPublicService: boolean;
}

export interface RailwayTrain {
  number: string;
  name: string;
  from: string | null;
  to: string | null;
}

export interface RailwayInfo {
  stationCode: string;
  stationName: string;
  trains: RailwayTrain[];
  trainCount: number;
}

export interface PostOfficeRecord {
  officeName: string;
  pincode: string;
  officeType: string;
  delivery: string | null;
  division: string | null;
  region: string | null;
  circle: string | null;
  district: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PostOfficeInfo {
  matched: PostOfficeRecord | null;
  offices: PostOfficeRecord[];
  officeCount: number;
  pincode: string | null;
  areaLabel: string | null;
}

export interface BankBranch {
  ifsc: string;
  bank: string;
  branch: string;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  micr: string | null;
  contact: string | null;
  neft: boolean;
  rtgs: boolean;
  imps: boolean;
  upi: boolean;
}

export interface BankingInfo {
  bankName: string;
  matched: BankBranch | null;
  branches: BankBranch[];
  branchCount: number;
  areaLabel: string | null;
}

/**
 * The name of the site a profile URL points at.
 *
 * Shown instead of the raw URL, which for these records is usually a numeric Facebook page
 * id — "facebook.com/109648271486990" tells a reader nothing and looks like a tracking link.
 * Anything unrecognised falls back to its hostname rather than being hidden: the link is
 * still useful, and guessing a friendly name we cannot verify is how a wrong brand ends up
 * on somebody's page.
 */
function socialLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const known: Record<string, string> = {
      'facebook.com': 'Facebook',
      'm.facebook.com': 'Facebook',
      'instagram.com': 'Instagram',
      'twitter.com': 'X',
      'x.com': 'X',
      'linkedin.com': 'LinkedIn',
      'youtube.com': 'YouTube',
      'wa.me': 'WhatsApp',
    };
    return known[host] ?? host;
  } catch {
    // Not a URL we can parse. A link we cannot name is not a link we should render.
    return null;
  }
}

/**
 * The address as a person would write it: street, area, mandal, district, state, country,
 * pincode.
 *
 * Deduplicated, because the parts overlap. `line1` frequently ends with the locality already
 * — "…Chandra Reddy Circle, Kokapet" beside a locality of "Kokapet" printed "Kokapet,
 * Kokapet" — and a mandal is often named after the town it sits in.
 */
function postalAddress(b: {
  addressLine: string | null;
  localityName: string | null;
  mandal?: string | null;
  cityName: string;
  stateName?: string | null;
  pincode: string | null;
}): string {
  // Written addresses already carry the area and the city, so appending our own
  // columns repeats them. This read:
  //
  //   #3rd Floor, Rajpurohit Towers, Nanakramguda Circle, Hyderabad.,
  //   Nanakramguda, Golconda, Hyderabad, Telangana, India — 500075
  //
  // Hyderabad three times and Nanakramguda twice. The previous check asked
  // whether an earlier part *ended with* the new one, which fails on both counts
  // here: the source line ends "Hyderabad." — a full stop is enough to miss it —
  // and "Nanakramguda" sits in the middle of that line rather than at its end.
  //
  // Compare whole comma-separated components, not loose words.
  //
  // Two failures bracket the right answer here. The original check asked whether
  // an earlier part *ended with* the new one, and missed "Nanakramguda Circle,
  // Hyderabad." because a full stop defeated it — the city printed twice. Fixing
  // that by comparing every word went too far the other way: "University of
  // Hyderabad" contains the word Hyderabad, so the city was suppressed entirely
  // and the address read "University of Hyderabad, CUC, Serilingampally,
  // Telangana" with no city in it at all.
  //
  // The distinction is whether the repeat is its own component. In "Nanakramguda
  // Circle, Hyderabad" the city is a separate part and repeating it is noise; in
  // "University of Hyderabad" it is a word inside a name and the city still needs
  // saying.
  const normalise = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();

  const parts: string[] = [];
  const written = new Set<string>();
  for (const part of [b.addressLine, b.localityName, b.mandal, b.cityName, b.stateName, 'India']) {
    const value = (part ?? '').trim().replace(/[.,\s]+$/, '');
    if (!value) continue;
    const key = normalise(value);
    if (!key) continue;
    if (written.has(key)) continue;
    parts.push(value);
    // Index each component of what was written, so a later part matching one of
    // them is recognised as a repeat.
    for (const piece of value.split(',')) {
      const pieceKey = normalise(piece);
      if (pieceKey) written.add(pieceKey);
    }
  }
  const line = parts.join(', ');
  return b.pincode ? `${line} — ${b.pincode}` : line;
}

// The locale is part of the cache key on purpose: the same business rendered at /te and at
// /en is two different documents, and caching one under the other's key would serve Telugu
// readers English (or worse, the reverse) from whichever page was built first.
const loadBusiness = cache(async (slug: string, locale: string): Promise<BusinessDetail | null> => {
  try {
    return await api<BusinessDetail>(
      `/businesses/${encodeURIComponent(slug)}?lang=${encodeURIComponent(locale)}`,
      { auth: true },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const business = await loadBusiness(slug, locale).catch(() => null);

  if (!business) {
    return { title: 'Business not found', robots: { index: false, follow: false } };
  }

  // Neighbourhood before district: "Kirana store in Madhapur, Hyderabad" matches how people
  // actually search, and is far less contested than the district-level phrase alone.
  const place = business.localityName
    ? `${business.localityName}, ${business.cityName}`
    : business.cityName;
  const cat = business.categoryName;
  // Lower-casing is an English habit. Telugu and Devanagari have no case, and forcing it on
  // a name that did not come from English is how a proper noun ends up looking wrong.
  const catLower = locale === 'en' ? cat.toLowerCase() : cat;
  // "{category} in {place}" is English word order. Telugu and Hindi both put the place
  // first, and the existing hub pattern already carries that per language, so the title is
  // built from it rather than from an English frame with the nouns swapped out.
  const placed = getMessageGroup(locale, 'hub')
    .metaTitle.replace('{category}', cat)
    .replace('{city}', place);
  const title = `${business.name} — ${placed}`;
  const description =
    business.description?.replace(/\s+/g, ' ').slice(0, 155) ??
    `${business.name} is listed as a ${catLower} in ${place}. Find available contact details, address, directions and opening hours on LocZ.`;
  const brandLogo = business.logoUrl ?? publicBrandLogo(business.name, business.publicBrandKey);

  // Factual entity and place phrases only. LocZ has no genuine ratings system yet, so metadata
  // must not imply "best", "top" or reviewed popularity merely to broaden a keyword list.
  const keywords = [
    business.name,
    `${business.name} ${business.cityName}`,
    `${cat} in ${business.cityName}`,
    ...(business.localityName ? [`${cat} in ${business.localityName}`, `${cat} in ${place}`] : []),
    `${catLower} near me`,
    `${catLower} near ${business.localityName ?? business.cityName}`,
    cat,
    business.cityName,
  ];

  // Bank/ATM pages carry authoritative IFSC data, so their title, summary and keywords are built
  // around what people actually search for ("<bank> <branch> IFSC code"). This is real entity
  // substance derived from data, not paraphrased filler.
  let finalTitle = title;
  let finalDescription = description;
  const bankKeywords: string[] = [];
  const bk = business.banking;
  if (bk) {
    if (bk.matched) {
      const m = bk.matched;
      finalTitle = `${m.bank} ${m.branch} IFSC Code ${m.ifsc} — ${place}`;
      finalDescription = `IFSC code of ${m.bank}, ${m.branch} branch is ${m.ifsc}${m.micr ? `, MICR ${m.micr}` : ''}. Address, NEFT/RTGS/IMPS/UPI details and branch info in ${place}.`;
      bankKeywords.push(
        `${m.bank} ${m.branch} IFSC code`,
        `${m.ifsc}`,
        `${m.bank} ${m.branch} branch`,
        `${m.bank} IFSC code ${m.branch}`,
        ...(m.micr ? [`${m.bank} ${m.branch} MICR code`] : []),
      );
    } else {
      const areaBank = bk.areaLabel ?? business.cityName;
      finalTitle = `${bk.bankName} IFSC Codes in ${areaBank} — Branches, MICR`;
      finalDescription = `Find IFSC and MICR codes for ${bk.bankName} branches in ${areaBank}, from the official RBI directory. Copy the code for your branch to make NEFT, RTGS, IMPS or UPI transfers.`;
      bankKeywords.push(
        `${bk.bankName} IFSC code ${areaBank}`,
        `${bk.bankName} ${areaBank} IFSC code`,
        `IFSC code ${bk.bankName} ${areaBank}`,
        `${bk.bankName} branches ${areaBank}`,
        `${bk.bankName} MICR code`,
      );
      // Real searches are BRANCH-level ("HDFC Bank Gachibowli IFSC code"), not district-level. Emit a
      // keyword per listed branch — its name and its raw IFSC — so the page targets those queries.
      for (const br of bk.branches) {
        const branchName = br.branch.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
        bankKeywords.push(`${bk.bankName} ${branchName} IFSC code`, br.ifsc);
      }
    }
  }

  // Post-office pages carry authoritative India Post data — target the searches people actually type
  // ("<office> pincode", "<place> post office pincode").
  const po = business.postOffice;
  if (po) {
    if (po.matched) {
      const m = po.matched;
      finalTitle = `${m.officeName} Pincode ${m.pincode} — ${m.officeType}`;
      finalDescription = `${m.officeName} (${m.officeType}) has pincode ${m.pincode}${m.district ? `, ${m.district}` : ''}. Delivery status, postal division and circle details from the official India Post directory.`;
      bankKeywords.push(
        `${m.officeName} pincode`,
        `${m.officeName} pincode ${m.pincode}`,
        `${m.pincode} pincode`,
        `${m.officeName} ${m.officeType}`,
        ...(m.district ? [`${m.district} post office pincode`] : []),
      );
    } else if (po.offices.length && po.pincode) {
      const areaPo = po.areaLabel ?? business.cityName;
      finalTitle = `Post Offices in Pincode ${po.pincode}${areaPo ? `, ${areaPo}` : ''} — India Post`;
      finalDescription = `List of India Post offices under pincode ${po.pincode}${areaPo ? ` in ${areaPo}` : ''}, with office type and delivery status from the official directory.`;
      bankKeywords.push(
        `pincode ${po.pincode}`,
        `${po.pincode} post office`,
        `${areaPo} post office pincode`,
        `post offices pincode ${po.pincode}`,
      );
      for (const o of po.offices) bankKeywords.push(`${o.officeName} pincode`);
    }
  }

  // Railway-station pages target the station-code searches people run ("<station> railway station code").
  const rail = business.railway;
  if (rail) {
    finalTitle = `${rail.stationName} Railway Station Code ${rail.stationCode} — Trains`;
    finalDescription = `${rail.stationName} railway station code is ${rail.stationCode}. ${rail.trainCount} trains serve this station — see the train numbers, names and routes.`;
    bankKeywords.push(
      `${rail.stationName} railway station code`,
      `${rail.stationName} station code`,
      `${rail.stationCode} station code`,
      `${rail.stationName} railway station`,
      `trains at ${rail.stationName}`,
    );
  }

  // Match the sitemap's quality gate. Sparse imported entities remain useful to visitors and
  // remain followable for discovery, but do not ask a crawler to index millions of pages whose
  // only differentiator is a substituted name. A real phone, owner description, claim,
  // verification or published listing supplies enough entity substance to become indexable.
  const nm = business.name.trim();
  const isJunkName =
    /^[0-9 .,-]+$/.test(nm) ||
    nm.length < 3 ||
    /https?:|www\.|\.com/i.test(nm) ||
    /^[0-9]{6}$/.test(nm);
  const isIndexable =
    !isJunkName &&
    (business.claimStatus === 'CLAIMED' ||
      business.verificationStatus === 'VERIFIED' ||
      Boolean(business.primaryPhone) ||
      !business.descriptionIsGenerated ||
      Boolean(bk && (bk.matched || bk.branches.length)) ||
      Boolean(po && (po.matched || po.offices.length)) ||
      Boolean(rail) ||
      business.listingCount > 0);

  return {
    title: finalTitle,
    description: finalDescription,
    keywords: [...bankKeywords, ...keywords],
    ...(!isIndexable ? { robots: { index: false, follow: true } } : {}),
    alternates: await localizedAlternates(`/b/${business.slug}`),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${SITE_URL}/b/${business.slug}`,
      ...(brandLogo ? { images: [{ url: new URL(brandLogo, SITE_URL).toString() }] } : {}),
    },
  };
}

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const [business, user] = await Promise.all([loadBusiness(slug, locale), getCurrentUser()]);

  if (!business) notFound();

  // The API also answers to a slug the business used to have, so old links keep working.
  // When that happens the URL asked for is not the canonical one, and serving the page at
  // both addresses would be two URLs for one business — duplicate content, and the ranking
  // split between them. 308 sends the reader and the crawler to the real one instead.
  if (business.slug !== slug) permanentRedirect(`/b/${business.slug}`);

  const t = getTranslator(locale);
  const p = getMessageGroup(locale, 'businessProfile');
  const profileLogo = business.logoUrl ?? publicBrandLogo(business.name, business.publicBrandKey);
  const localizedDays = [
    p.sunday,
    p.monday,
    p.tuesday,
    p.wednesday,
    p.thursday,
    p.friday,
    p.saturday,
  ];
  // "Similar businesses nearby" — the same category around this exact point. Every page gets a
  // different set (it depends on the coordinates), so it is genuinely unique content, and the
  // links weave the directory into a mesh a crawler can follow into the deep pages.
  // lang travels with the request so the cards carry Telugu category names on a Telugu page.
  // It is also part of the ISR cache key, which is the reason it belongs in the query string
  // rather than in a header.
  const similarQuery = new URLSearchParams({
    categoryId: business.categoryId,
    limit: '25',
    lang: locale,
  });
  if (business.latitude !== null && business.longitude !== null) {
    similarQuery.set('latitude', String(business.latitude));
    similarQuery.set('longitude', String(business.longitude));
    similarQuery.set('radiusKm', '10');
  } else if (business.pincode) {
    similarQuery.set('pincode', business.pincode);
  }
  const [listings, similarResponse] = await Promise.all([
    apiSafe<{ items: ListingSummary[] }>(`/search?businessId=${business.id}&limit=12`, {
      revalidate: 300,
    }),
    apiSafe<{ items: SimilarBusiness[] }>(`/businesses/nearby?${similarQuery.toString()}`, {
      revalidate: 900,
    }),
  ]);

  // Whether this business has anything published. Used to decide whether the
  // listings section exists at all, and whether its tab is offered.
  const hasListings = !business.isPublicService && Boolean(listings && listings.items.length > 0);

  // How much this page actually has to say, counted in real fields. A business with
  // a name and a phone number carries one advertisement; one with an address, a
  // landmark, hours and neighbours can carry three. Nothing here can be satisfied by
  // writing more words, which is the point - padding a page to qualify it for
  // another ad unit would be the exact behaviour this is meant to prevent.
  const adContentScore = [
    Boolean(business.addressLine),
    Boolean(business.landmark),
    business.hours.length > 0,
    Boolean(business.website),
  ].filter(Boolean).length;
  // 24 rather than 8. This is the crawl frontier: a storefront is where a crawler arrives, and
  // eight outbound links made 4.2M pages a near-dead end, which is a large part of why Search
  // Console holds ~1.95M URLs as discovered but never fetched. Tripling the fan-out is only safe
  // because the cards below are prefetch={false} -- left prefetching, 24 viewport-triggered RSC
  // renders per page would rebuild the request storm that saturated the server.
  const similarPool = (similarResponse?.items ?? []).filter((b) => b.slug !== business.slug);
  /*
   * Prefer neighbours that are not another outlet of the same chain.
   *
   * On a chain page every neighbour carries the same name, so the grid printed "Dr Lal PathLabs
   * Patient Service Centre" twenty-four times -- the bulk of the twenty-one repetitions two
   * branches shared, and no help at all to a reader deciding which one to visit. Order
   * differently-named businesses first and keep the same-name ones only to fill the remainder,
   * so a cluster still links onward but stops reprinting one string down the page.
   *
   * Distance order is preserved within each half; this re-ranks, it does not hide anything.
   */
  const ownName = business.name.trim().toLowerCase();
  const similar = [
    ...similarPool.filter((b) => b.name.trim().toLowerCase() !== ownName),
    ...similarPool.filter((b) => b.name.trim().toLowerCase() === ownName),
  ].slice(0, 24);
  /*
   * Chain outlets, and the name that repeats twenty-one times.
   *
   * 679,346 businesses share their exact name with another business in the same city -- 19,773
   * called "Hindustan Petroleum Corporation Limited", 15,271 "HDFC Bank ATM", 1,853 in the largest
   * single group. On those pages the name is the page: it appears in the heading, in every FAQ
   * question and answer, in the description, and again in a nearby list made up of other outlets
   * with the identical name. Two branches of one chain in one city measured 83.2% identical
   * phrasing with a 372-word verbatim run, which no amount of generated prose can separate.
   *
   * Detect it from the neighbours already fetched -- if one of them carries this exact name, this
   * is an outlet rather than a place -- and then say the name once, qualified by where this
   * particular one is, and refer to it plainly afterwards. A reader is better served too: "Dr Lal
   * PathLabs Patient Service Centre" tells them nothing about which of the forty is meant.
   */
  // Read the full pool, not the trimmed list: same-name neighbours are ordered last now, so a
  // chain with more than 24 differently-named neighbours would drop them and look unique.
  const isChainOutlet = similarPool.some((b) => b.name.trim().toLowerCase() === ownName);
  const placeQualifier = business.localityName || business.pincode || business.cityName;
  // Qualified once, for the first mention. Not used as the page's <h1>: the heading is the
  // business's own name, and renaming a listing is not ours to do.
  const qualifiedName = isChainOutlet ? `${business.name} (${placeQualifier})` : business.name;
  // Everything after the first mention. A chain page stops repeating the shared name; a place
  // with its own name keeps using it, because there it is the thing people search for.
  // "this branch", not "this diagnostic labs & imaging". Category names are plural noun phrases
  // and read as a typo in a possessive ("this diagnostic labs & imaging's phone number"); the
  // word that fits every case where this applies is the one for an outlet of a chain.
  const shortName = isChainOutlet ? 'this branch' : business.name;

  // The written body of the page. Category copy (true of the trade, written once) joined to
  // measured facts about this place (counts, neighbour names, real distances) -- see
  // business-description.ts. An owner's own description replaces all of it, which is what a
  // claim buys them.
  const localArea =
    business.localityName || business.addressLine || business.mandal || business.cityName;
  //
  // Gate on who wrote it, not on whether it exists. The API composes a description for every
  // imported record (see apps/api/src/businesses/business-description.ts), so `description` is
  // truthy on all 4.3M pages and this block rendered on none of them. `descriptionIsGenerated`
  // is the flag that separates an owner's words from ours.
  const localContext =
    business.description && !business.descriptionIsGenerated
      ? []
      : describeBusiness({
          name: qualifiedName,
          categorySlug: business.categorySlug,
          categoryName: business.categoryName,
          keywords: business.keywords,
          area: localArea,
          cityName: business.cityName,
          pincode: business.pincode,
          hasPhone: Boolean(business.primaryPhone),
          hasWebsite: Boolean(business.website),
          hasHours: business.hours.length > 0,
          neighbours: similar.map((b) => ({ name: b.name, distanceMeters: b.distanceMeters })),
          radiusKm: 10,
          seed: business.slug,
          units: { m: t('common.m'), km: t('common.km') },
        });

  const openState = currentOpenState(business.hours, p);
  const mapUrl =
    business.latitude !== null && business.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}`
      : null;
  const directionsUrl =
    business.latitude !== null && business.longitude !== null
      ? `https://www.google.com/maps/dir/?api=1&destination=${business.latitude},${business.longitude}`
      : null;

  // The neighbourhood placement, in words — "directions" a crawler and a reader can both use,
  // assembled only from address facts (no invented turn-by-turn, which would need an origin).
  const placeLabel = business.localityName
    ? `${business.localityName}, ${business.cityName}`
    : business.cityName;
  // Real profiles the source recorded, so a reader can check the business somewhere that is
  // not LocZ. nofollow because these are third-party links we did not vet.
  const socialProfiles = (business.socialLinks ?? [])
    .map((url) => ({ url, label: socialLabel(url) }))
    .filter((profile): profile is { url: string; label: string } => profile.label !== null)
    .slice(0, 4);

  const rawWa = business.whatsappNumber || business.primaryPhone;
  const digitsOnly = rawWa?.replace(/[^0-9]/g, '');
  const waNumber = digitsOnly ? (digitsOnly.length === 10 ? `91${digitsOnly}` : digitsOnly) : null;
  const businessUrl = `https://locz.in/b/${business.slug}`;
  const waMessage = `🛍️ *Inquiry for ${business.name}*\n\nHi, I found your business on LocZ.in (${businessUrl})\n\nI would like to enquire about:\n- Services & Products available\n- Pricing & Availability\n\nPlease let me know. Thanks!`;
  const waEnquiryUrl = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`
    : null;

  // Rich, fact-driven conditional FAQs based on data density
  const nearestNeighbour = similar.find((b) => typeof b.distanceMeters === 'number');
  const faqs: Array<{ q: string; a: string }> = [
    // Every storefront carried the same four questions with only the name swapped, which is a
    // large part of why same-category pages measured ~43% identical phrasing. This one is
    // answered from the neighbour rows, so its numbers and names differ on every page.
    similar.length > 0
      ? {
          q: `How many ${business.categoryName.toLowerCase()} are near ${qualifiedName}?`,
          a: `LocZ maps ${similar.length + 1} ${business.categoryName.toLowerCase()} within 10 km of ${localArea}${
            nearestNeighbour
              ? `. The closest other one is ${nearestNeighbour.name}, about ${formatDistance(nearestNeighbour.distanceMeters as number, t)} away`
              : ''
          }.`,
        }
      : null,
    business.railway
      ? {
          q: `What is the station code of ${business.railway.stationName} railway station?`,
          a: `The station code of ${business.railway.stationName} railway station is ${business.railway.stationCode}. ${business.railway.trainCount} trains serve this station; the train list on this page shows their numbers, names and routes.`,
        }
      : null,
    business.postOffice?.matched
      ? {
          q: `What is the pincode of ${business.postOffice.matched.officeName}?`,
          a: `The pincode of ${business.postOffice.matched.officeName} (${business.postOffice.matched.officeType}) is ${business.postOffice.matched.pincode}${business.postOffice.matched.district ? `, in ${business.postOffice.matched.district}` : ''}. It is ${business.postOffice.matched.delivery === 'Delivery' ? 'a delivery post office' : 'listed in the official India Post directory'}.`,
        }
      : business.postOffice && business.postOffice.offices.length && business.postOffice.pincode
        ? {
            q: `Which post offices come under pincode ${business.postOffice.pincode}?`,
            a: `Pincode ${business.postOffice.pincode} covers ${business.postOffice.officeCount} India Post office${business.postOffice.officeCount === 1 ? '' : 's'}. The list on this page shows each office with its type (Head, Sub or Branch) and delivery status.`,
          }
        : null,
    business.banking?.matched
      ? {
          q: `What is the IFSC code of ${business.banking.matched.bank}, ${business.banking.matched.branch} branch?`,
          a: `The IFSC code of ${business.banking.matched.bank}, ${business.banking.matched.branch} branch is ${business.banking.matched.ifsc}${business.banking.matched.micr ? `, and its MICR code is ${business.banking.matched.micr}` : ''}. Use it for NEFT, RTGS, IMPS and UPI transfers.`,
        }
      : business.banking && business.banking.branches.length
        ? {
            q: `How do I find the IFSC code for a ${business.banking.bankName} branch in ${business.banking.areaLabel ?? business.cityName}?`,
            a: `${business.banking.bankName} has ${business.banking.branchCount} branch${business.banking.branchCount === 1 ? '' : 'es'} in ${business.banking.areaLabel ?? business.cityName}. The branch list on this page shows the official IFSC and MICR code for each — copy the one that matches your branch.`,
          }
        : null,
    business.primaryPhone
      ? {
          q: p.faqPhoneQ.replace('{name}', shortName),
          a: p.faqPhoneA
            .replace('{name}', shortName)
            .replace('{phone}', formatPhone(business.primaryPhone)),
        }
      : null,
    {
      q: p.faqWhereQ.replace('{name}', shortName),
      a: p.faqWhereA.replace('{name}', shortName).replace('{place}', postalAddress(business)),
    },
    business.landmark
      ? {
          q: `What landmark is ${shortName} located near?`,
          a: `${shortName} is situated in close proximity to ${business.landmark} in ${placeLabel}.`,
        }
      : null,
    business.pincode
      ? {
          q: `What is the postal PIN code for ${shortName}?`,
          a: `The postal PIN code for ${shortName} in ${business.cityName} is ${business.pincode}.`,
        }
      : null,
    business.hours.length
      ? {
          q: p.faqHoursQ.replace('{name}', shortName),
          a: `${shortName} is currently ${openState.label.toLowerCase()}. Check the detailed weekly schedule on this page for exact operating hours.`,
        }
      : null,
    !business.isPublicService && waNumber
      ? {
          q: p.faqWhatsappQ.replace('{name}', shortName),
          a: `Yes, you can connect directly with ${shortName} on WhatsApp for quick messages, pricing, and service queries.`,
        }
      : null,
    !business.isPublicService && business.keywords.length > 0
      ? {
          q: `What services or products are available at ${shortName}?`,
          a: `${shortName} in ${placeLabel} specializes in ${business.categoryName.toLowerCase()}, covering ${business.keywords.slice(0, 5).join(', ')}.`,
        }
      : null,
    directionsUrl
      ? {
          q: `How can I get directions to ${shortName}?`,
          a: `You can use the Get Directions button on this page to navigate to ${shortName} via Google Maps or GPS.`,
        }
      : null,
  ].filter((item): item is { q: string; a: string } => item !== null);

  const { jsonLd, breadcrumbLd, faqLd, similarLd } = buildStorefrontJsonLd(business, {
    profileLogo,
    faqs,
    similar,
  });
  // Falls back to the parent category's artwork.
  //
  // The catalogue is keyed by the original 45 category names. Businesses now sit on one of
  // 1,375 subcategories — "Wellness centres" rather than "Salons & spas" — and none of those
  // have a banner of their own, so the page lost its photograph entirely.
  const categoryBanner =
    premiumBusinessBanner(business.name, business.categoryName) ??
    premiumBusinessBanner(business.name, business.parentCategoryName);
  const displayCategory = storefrontCategoryLabel(business.name, business.categoryName);
  // Same fallback: the small artwork is keyed on the original category names too.
  const categoryArtwork =
    premiumCategoryArtwork({
      name: storefrontArtworkCategory(business.name, business.categoryName),
    }) ??
    premiumCategoryArtwork({
      name: storefrontArtworkCategory(business.name, business.parentCategoryName ?? ''),
    });
  // The composed block below says all of this and more, so showing the API's generated line as
  // well would repeat the same facts twice on the page -- and repeated facts across 4.3M pages
  // is the problem being fixed. An owner's own description always shows.
  const storefrontDescription = business.descriptionIsGenerated
    ? localContext.length > 0
      ? null
      : displayCategory !== business.categoryName
        ? (business.description?.replace(business.categoryName, displayCategory) ?? null)
        : business.description
    : business.description;

  return (
    <div
      className={`business-profile${business.isPublicService ? ' business-profile--public-service' : ''}`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }}
      />
      {faqLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }}
        />
      ) : null}
      {similarLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(similarLd).replace(/</g, '\\u003c') }}
        />
      ) : null}

      <BusinessActionTracker
        businessId={business.id}
        category={business.categoryName}
        city={business.cityName}
        locality={business.localityName}
      />

      <section className="business-profile-hero">
        <div className="container">
          <BusinessBackButton label={p.back} />
          <nav className="business-profile-breadcrumbs" aria-label={p.breadcrumb}>
            <Link href="/">{t('nav.home')}</Link>
            <Icon name="arrow" />
            <Link href={`/in/${business.citySlug}`}>{business.cityName}</Link>
            <Icon name="arrow" />
            <Link href={`/in/${business.citySlug}/${business.categorySlug}`}>
              {business.categoryName}
            </Link>
          </nav>

          <div className={`business-profile-cover${categoryBanner ? ' has-banner' : ''}`}>
            {categoryBanner ? (
              <picture>
                <source media="(max-width: 760px)" srcSet={categoryBanner.mobile} />
                <Image
                  src={categoryBanner.desktop}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 760px) 100vw, 1440px"
                  className="business-profile-cover__banner"
                />
              </picture>
            ) : (
              <span className="business-profile-cover__shape" aria-hidden="true">
                <Image src={categoryArtwork} alt="" width={148} height={148} />
              </span>
            )}
            <div className="business-profile-cover__copy">
              <span>{business.categoryName}</span>
              <strong>{business.cityName}</strong>
            </div>
            <div className="business-profile-cover__actions">
              <BookmarkBusiness
                id={business.id}
                name={business.name}
                slug={business.slug}
                cityName={business.cityName}
                categoryName={business.categoryName}
              />
              <ShareBusiness name={business.name} labels={p} />
              {business.isOwner ? (
                <Link href="/dashboard">
                  <Icon name="user" /> {p.manageProfile}
                </Link>
              ) : null}
            </div>

            <div className="business-profile-identity">
              <span
                className={`business-profile-logo ${
                  profileLogo ? 'business-profile-logo--image' : 'business-profile-logo--monogram'
                }`}
              >
                {profileLogo ? (
                  <Image src={profileLogo} alt={`${business.name} logo`} width={112} height={112} />
                ) : (
                  <span aria-hidden="true">{business.name.slice(0, 1).toUpperCase()}</span>
                )}
              </span>
              <div className="business-profile-identity__content">
                <span className="business-profile-category">
                  {business.isPublicService
                    ? `${p.publicService} · ${business.categoryName}`
                    : displayCategory}
                  {business.localityName ? ` · ${business.localityName}` : ''}
                </span>
                <h1>{business.name}</h1>
                <p className="business-profile-identity__address">
                  <Icon name="location" /> {postalAddress(business)}
                </p>
                <div className="business-profile-badges">
                  {business.isPublicService ? (
                    <span
                      className={business.verificationStatus === 'VERIFIED' ? 'is-verified' : ''}
                    >
                      <Icon name="government" /> {p.publicService}
                    </span>
                  ) : business.verificationStatus === 'VERIFIED' ? (
                    <span className="is-verified">
                      <Icon name="shield" /> {p.verifiedBusiness}
                    </span>
                  ) : (
                    <span>
                      <Icon name="store" /> {p.localBusiness}
                    </span>
                  )}
                  <span className={openState.isOpen ? 'is-open' : ''}>
                    <i /> {openState.label}
                  </span>
                  <span>
                    {p.onLoczSince} {new Date(business.createdAt).getFullYear()}
                  </span>
                  {business.loczId ? (
                    <span className="business-profile-identity__id">
                      {p.loczId} <code>{business.loczId}</code>
                    </span>
                  ) : null}
                  {!business.isPublicService &&
                  business.claimStatus === 'UNCLAIMED' &&
                  business.viewCount > 0 ? (
                    <span className="business-profile-badges__interest" role="status">
                      <Icon name="sparkles" />
                      {p.profileInterest.replace(
                        '{count}',
                        business.viewCount.toLocaleString(`${locale}-IN`),
                      )}
                    </span>
                  ) : null}
                </div>
                <div className="business-profile-identity__actions" aria-label={p.talkBusiness}>
                  {business.primaryPhone ? (
                    <a
                      href={`tel:${business.primaryPhone}`}
                      data-track="call_click"
                      className="is-call"
                    >
                      <Icon name="phone" /> {p.callBusiness}
                    </a>
                  ) : null}
                  {!business.isPublicService && waEnquiryUrl ? (
                    <a
                      href={waEnquiryUrl}
                      data-track="whatsapp_click"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="is-whatsapp"
                    >
                      <Icon name="message" /> WhatsApp
                    </a>
                  ) : null}
                  {directionsUrl ? (
                    <a
                      href={directionsUrl}
                      data-track="directions_click"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="is-directions"
                    >
                      <Icon name="location" /> {p.getDirections}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container business-profile-layout">
        <main>
          <StorefrontTabs
            label={business.isPublicService ? p.publicServiceProfile : p.profileSections}
            items={[
              { id: 'about', icon: 'user', label: p.about },
              ...(hasListings ? [{ id: 'listings', icon: 'store', label: p.listingsOffers }] : []),
              { id: 'hours', icon: 'calendar', label: p.hoursLocation },
              ...(faqs.length ? [{ id: 'faq', icon: 'sparkles', label: p.goodToKnow }] : []),
              ...(similar.length ? [{ id: 'nearby', icon: 'location', label: p.nearbyTab }] : []),
            ]}
          />

          {business.banking && (business.banking.matched || business.banking.branches.length) ? (
            <BankingDetails banking={business.banking} place={placeLabel} labels={p} />
          ) : null}

          {business.postOffice &&
          (business.postOffice.matched || business.postOffice.offices.length) ? (
            <PostOfficeDetails info={business.postOffice} place={placeLabel} labels={p} />
          ) : null}

          {business.railway ? <RailwayDetails info={business.railway} labels={p} /> : null}

          <section className="business-profile-section business-profile-section--about" id="about">
            <span className="section-kicker">
              {business.isPublicService ? p.publicInformationKicker : p.meetBusiness}
            </span>
            <h2>
              {(business.isPublicService ? p.publicAbout : p.aboutBusiness).replace(
                '{name}',
                business.name,
              )}
            </h2>
            <div className="business-profile-about-grid">
              <div>
                {storefrontDescription ? (
                  // The "written from public listing data" note used to sit here, under every
                  // one of three and a half million descriptions. It is gone because the page
                  // already says it, better and once: the unclaimed panel below states that
                  // nobody has confirmed these details, and the licence attribution at the
                  // foot names the source. Saying it a third time under every paragraph read
                  // as a disclaimer on the shop itself.
                  <p className="business-profile-about">{storefrontDescription}</p>
                ) : (
                  <p className="business-profile-about is-empty">{p.noStory}</p>
                )}

                {business.keywords.length > 0 ? (
                  <div className="business-profile-specialties">
                    <span className="business-profile-specialties__label">
                      {business.isPublicService ? p.publicFacilities : 'Specialties & Services:'}
                    </span>
                    <div className="business-profile-specialties__tags">
                      {business.keywords.slice(0, 8).map((kw) => (
                        <span key={kw} className="badge-pill">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <aside className="business-profile-about__place">
                {/* This panel used to say "It is in Kokapet, Hyderabad." and then, two boxes
                    later, "Based in Kokapet, Hyderabad" — both repeating the first sentence
                    of the description directly above them. Three statements of one fact read
                    as less information, not more. What is here now is what the page does not
                    already say somewhere else. */}
                {business.landmark ? (
                  <p className="business-profile-where">
                    <Icon name="location" />{' '}
                    {p.nearLandmarkFact.replace('{landmark}', business.landmark)}
                  </p>
                ) : null}
                {socialProfiles.length > 0 ? (
                  <p className="business-profile-social">
                    {p.socialProfiles}{' '}
                    {socialProfiles.map((profile, index) => (
                      <span key={profile.url}>
                        {index > 0 ? ', ' : ''}
                        <a href={profile.url} target="_blank" rel="nofollow noopener noreferrer">
                          {profile.label}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
                {!business.isPublicService &&
                business.claimStatus === 'UNCLAIMED' &&
                business.isClaimable !== false &&
                !business.isOwner ? (
                  <p className="business-profile-unclaimed">
                    {p.unclaimed}{' '}
                    <Link href={`/b/${business.slug}/claim`} data-track="claim_click">
                      {p.claimAction}
                    </Link>
                  </p>
                ) : null}
              </aside>
            </div>
          </section>

          {/* The reader has the identity, primary actions and business story by now. */}
          <StorefrontHouseAd
            businessId={business.id}
            businessName={business.name}
            city={business.cityName}
            category={business.categoryName}
            labels={{ region: p.onrolProgram, link: p.onrolOpen, imageAlt: p.onrolAlt }}
          />

          {!business.isPublicService ? (
            <aside className="business-profile-post-cta" aria-labelledby="storefront-post-title">
              <span className="business-profile-post-cta__icon" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <div>
                <span className="section-kicker">{p.postFreeKicker}</span>
                <h2 id="storefront-post-title">{p.postFreeTitle}</h2>
                <p>{p.postFreeBody}</p>
              </div>
              <Link href="/post" className="btn business-profile-post-cta__action">
                {p.postFreeAction} <Icon name="arrow" />
              </Link>
            </aside>
          ) : null}

          {/* Rendered only when there is something in it.

              No business in the directory has published a listing yet, so this
              section's empty state - a picture, "Nothing published right now",
              and a line explaining what would appear here - was rendering on
              essentially all 2.9 million pages. That is boilerplate repeated
              across the whole site, which is the opposite of what a page needs
              to be worth indexing, and it told the reader nothing.

              The claim prompt is not lost: the About panel above already says
              the listing is unclaimed and offers the same link. */}
          {hasListings ? (
            <section className="business-profile-section" id="listings">
              <div className="business-profile-section__head">
                <div>
                  <span className="section-kicker">{p.exploreAvailable}</span>
                  <h2>{p.listingsHeading}</h2>
                </div>
                {listings?.items.length ? (
                  <Link href={`/search?businessId=${business.id}`}>
                    {p.seeAll} <Icon name="arrow" />
                  </Link>
                ) : null}
              </div>
              {listings && listings.items.length > 0 ? (
                <div className="card-grid business-profile-listings">
                  {listings.items.slice(0, 6).map((listing) => (
                    <ListingCard key={listing.id} listing={listing} t={t} />
                  ))}
                </div>
              ) : (
                <div className="business-profile-empty">
                  <span className="business-profile-empty__art">
                    <Image src={categoryArtwork} alt="" width={92} height={92} />
                  </span>
                  <div>
                    <strong>{p.nothingPublished}</strong>
                    <p>{p.nothingPublishedBody}</p>
                  </div>
                  {!business.isPublicService &&
                  business.claimStatus === 'UNCLAIMED' &&
                  business.isClaimable !== false &&
                  !business.isOwner ? (
                    <Link href={`/b/${business.slug}/claim`} data-track="claim_click">
                      {p.claimAction} <Icon name="arrow" />
                    </Link>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          <section className="business-profile-section business-profile-hours" id="hours">
            <div>
              <span className="section-kicker">{p.planVisit}</span>
              <h2>{p.hoursLocation}</h2>
              {/* The name on its own line, the address under it, the way it would be written
                  on an envelope. Inline with a comma it wrapped mid-name and, for a business
                  with no street line, opened with a stray comma. */}
              <p className="business-profile-address">
                <Icon name="location" />
                <span>
                  <span>{postalAddress(business)}</span>
                </span>
              </p>
              <div className="business-profile-map-actions">
                {/* The three things somebody does with an address: go there, ring ahead, or
                    look the business up. They belong next to it, not in a sidebar. */}
                {business.primaryPhone ? (
                  <a
                    href={`tel:${business.primaryPhone}`}
                    data-track="call_click"
                    className="btn btn--ghost btn--sm"
                  >
                    <Icon name="phone" /> {formatPhone(business.primaryPhone)}
                  </a>
                ) : null}
                {business.email ? (
                  <a
                    href={`mailto:${business.email}`}
                    data-track="email_click"
                    className="btn btn--ghost btn--sm"
                  >
                    <Icon name="mail" /> {business.email}
                  </a>
                ) : null}
                {business.website ? (
                  <a
                    href={business.website}
                    data-track="website_click"
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="btn btn--ghost btn--sm"
                  >
                    <Icon name="globe" /> {p.visitWebsite}
                  </a>
                ) : null}
                {directionsUrl ? (
                  <a
                    href={directionsUrl}
                    data-track="directions_click"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--primary btn--sm"
                  >
                    <Icon name="location" /> {p.getDirections}
                  </a>
                ) : null}
                {mapUrl ? (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ghost btn--sm"
                  >
                    {p.viewOnMaps} <Icon name="arrow" />
                  </a>
                ) : null}
              </div>
            </div>
            {business.hours.length ? (
              <dl>
                {localizedDays.map((day, dayIndex) => {
                  const slots = business.hours.filter((hour) => hour.dayOfWeek === dayIndex);
                  if (!slots.length) return null;
                  return (
                    <div key={day} className={dayIndex === currentIndiaDay() ? 'is-today' : ''}>
                      <dt>
                        {day}
                        <span>{dayIndex === currentIndiaDay() ? p.today : ''}</span>
                      </dt>
                      <dd>{slots.map((hour) => formatHour(hour, p)).join(', ')}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
            {/* "Hours not added yet — send an enquiry before making a special trip" used
                to sit here. Only about one business in the directory in a hundred has
                published hours, so on nearly every page it was a paragraph saying that a
                fact is missing, which is not itself a fact. The section stays, because
                the address and the contact buttons above it are the reason anyone opens
                it; only the notice about absent hours is gone.

                The "Hours not listed" chip in the hero already tells a reader they do not
                know when this place is open, once, in three words. */}
          </section>

          {localContext.length > 0 ? (
            <section className="business-profile-section business-profile-local" id="around">
              <span className="section-kicker">{business.categoryName}</span>
              <h2>{getMessageGroup(locale, 'businessLocal').heading}</h2>
              {localContext.map((paragraph) => (
                <p className="business-profile-local__body" key={paragraph.slice(0, 48)}>
                  {paragraph}
                </p>
              ))}
            </section>
          ) : null}

          {faqs.length > 0 ? (
            <section className="business-profile-section business-profile-faq" id="faq">
              <span className="section-kicker">{p.goodToKnow}</span>
              <h2>{p.faqHeading.replace('{name}', shortName)}</h2>
              <dl className="business-profile-faq__list">
                {faqs.map((item) => (
                  <div key={item.q}>
                    <dt>{item.q}</dt>
                    <dd>{item.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {similar.length > 0 ? (
            <>
              {/* Before the list, never among it. Those are internal links people
                  navigate by, and an advertisement between two of them would read as a
                  result. */}
              <AdSlot placement="BUSINESS_BEFORE_NEARBY" contentScore={adContentScore} />
              <section className="business-profile-section business-profile-similar" id="nearby">
                <div className="business-profile-section__head">
                  <div>
                    <span className="section-kicker">{p.exploreArea}</span>
                    <h2>
                      {(business.isPublicService ? p.publicNearby : p.similarHeading)
                        .replace('{category}', business.categoryName)
                        .replace('{place}', placeLabel)}
                    </h2>
                  </div>
                </div>
                <ul className="business-profile-similar__grid">
                  {similar.map((b) => {
                    const nearbyLogo = b.logoUrl ?? publicBrandLogo(b.name, b.publicBrandKey);
                    return (
                      <li key={b.id}>
                        <Link href={`/b/${b.slug}`} prefetch={false}>
                          <span
                            className={`business-profile-similar__logo${nearbyLogo ? ' has-logo' : ''}`}
                            aria-hidden="true"
                          >
                            <Image
                              src={nearbyLogo ?? premiumCategoryArtwork({ name: b.categoryName })}
                              alt=""
                              width={56}
                              height={56}
                            />
                          </span>
                          <span className="business-profile-similar__body">
                            {/* Only what differs from the heading above.
 
                                Every card used to repeat the category, "Public service" and the
                                city -- but this grid is one category in one city by construction,
                                so those three were identical on all 24 cards and told a reader
                                nothing the section heading had not already said. Across two banks
                                in the same city it was also the largest block of text the two
                                pages shared: a 44-word run of "public service hyderabad banks amp
                                atms" repeating card after card, which is what tripling this grid
                                from 8 to 24 multiplied. Print a label only where it actually
                                varies. */}
                            {b.categoryName !== business.categoryName ? (
                              <span>{b.categoryName}</span>
                            ) : null}
                            <strong>{b.name}</strong>
                            <small>
                              {!business.isPublicService && b.verificationStatus === 'VERIFIED' ? (
                                <>
                                  <Icon name="shield" /> {p.verifiedBusiness} ·{' '}
                                </>
                              ) : null}
                              {[b.cityName === business.cityName ? null : b.cityName, b.pincode]
                                .filter(Boolean)
                                .join(' · ')}
                              {typeof b.distanceMeters === 'number'
                                ? ` · ${formatDistance(b.distanceMeters, t)}`
                                : ''}
                            </small>
                          </span>
                          <Icon name="arrow" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          ) : null}

          {!business.isPublicService ? (
            <section className="business-profile-safety">
              <Icon name="shield" />
              <div>
                <strong>{p.safetyTitle}</strong>
                <p>{p.safetyBody}</p>
              </div>
              <Link href="/safety">
                {p.safetyTips} <Icon name="arrow" />
              </Link>
            </section>
          ) : null}
          {/* Not presentation polish. ODbL and CDLA both require attribution to travel with
            the data, so a page rendering an imported record without this is using that
            record outside its licence. */}
          {business.attribution ? (
            <p className="business-profile-attribution">{business.attribution}</p>
          ) : null}
          <section className="business-profile-provenance" aria-labelledby="listing-information">
            <div>
              <span className="section-kicker">{p.listingInformation}</span>
              <h2 id="listing-information">{p.informationTransparency}</h2>
            </div>
            <dl>
              <div>
                <dt>{p.informationSource}</dt>
                <dd>{business.sourceName ?? p.loczSource}</dd>
              </div>
              <div>
                <dt>{p.profileUpdated}</dt>
                <dd>
                  {business.updatedAt
                    ? formatProfileDate(business.updatedAt, locale)
                    : p.notAvailable}
                </dd>
              </div>
              <div>
                <dt>{business.isPublicService ? p.publicRecordStatus : p.claimStatus}</dt>
                <dd>
                  {business.isPublicService
                    ? p.officialPublicRecord
                    : business.claimStatus === 'UNCLAIMED'
                      ? p.statusUnclaimed
                      : p.statusClaimed}
                </dd>
              </div>
              <div>
                <dt>{p.informationStatus}</dt>
                <dd>
                  {business.verificationStatus === 'VERIFIED'
                    ? business.verifiedAt
                      ? p.statusVerifiedOn.replace(
                          '{date}',
                          formatProfileDate(business.verifiedAt, locale),
                        )
                      : p.statusVerified
                    : p.statusUnverified}
                </dd>
              </div>
            </dl>
            <div className="business-profile-provenance__actions">
              <Link
                href={`/report?type=BUSINESS&id=${business.id}&reason=CORRECTION`}
                className="btn btn--ghost btn--sm"
              >
                <Icon name="pencil" />
                {business.isPublicService ? p.suggestCorrection : 'Suggest an edit'}
              </Link>
            </div>
          </section>
        </main>

        <aside
          className={`business-profile-contact${business.isPublicService ? ' is-public-service' : ''}`}
          id="contact"
        >
          <section>
            <div className="business-profile-contact__brand">
              <span aria-hidden="true">
                <Image src={categoryArtwork} alt="" width={64} height={64} />
              </span>
              <div>
                <strong>{business.name}</strong>
                <small>{placeLabel}</small>
              </div>
            </div>
            <span className="section-kicker">
              {business.isPublicService ? p.publicInformationKicker : p.talkBusiness}
            </span>
            <h2>{business.isPublicService ? p.officialContact : p.howHelp}</h2>
            <p>{business.isPublicService ? p.officialContactBody : p.contactPrivate}</p>
            {business.isPublicService ? null : business.isOwner ? (
              <Link href="/dashboard" className="btn btn--primary btn--block">
                <Icon name="user" /> {p.manageBusiness}
              </Link>
            ) : (
              <BusinessEnquiry
                businessId={business.id}
                businessName={business.name}
                businessSlug={business.slug}
                isSignedIn={Boolean(user)}
                labels={p}
              />
            )}

            <div className="business-profile-contact__direct">
              {business.primaryPhone ? (
                <a href={`tel:${business.primaryPhone}`} data-track="call_click">
                  <Icon name="phone" />
                  <span>
                    <small>{p.callBusiness}</small>
                    <strong>{formatPhone(business.primaryPhone)}</strong>
                  </span>
                </a>
              ) : null}
              {!business.isPublicService && business.whatsappNumber ? (
                <a
                  href={`https://wa.me/${business.whatsappNumber.replace('+', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="message" />
                  <span>
                    <small>{p.chatOn}</small>
                    <strong>WhatsApp</strong>
                  </span>
                </a>
              ) : null}
              {business.website ? (
                <a
                  href={business.website}
                  data-track="website_click"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  <Icon name="store" />
                  <span>
                    <small>{p.visit}</small>
                    <strong>{p.website}</strong>
                  </span>
                </a>
              ) : null}
              {business.email ? (
                <a href={`mailto:${business.email}`} data-track="email_click">
                  <Icon name="message" />
                  <span>
                    <small>{p.sendAn}</small>
                    <strong>{p.email}</strong>
                  </span>
                </a>
              ) : null}
            </div>
          </section>

          {!business.isPublicService &&
          business.claimStatus === 'UNCLAIMED' &&
          business.isClaimable !== false &&
          !business.isOwner ? (
            <div className="business-profile-claim-card">
              <div className="business-profile-claim-card__head">
                <span className="business-profile-claim-card__icon">
                  <Icon name="shield" />
                </span>
                <div>
                  <strong>Own this business?</strong>
                  <small>{p.claimVerifiedProfile}</small>
                </div>
              </div>
              <p>Get a verified badge, update details & receive direct WhatsApp customer leads.</p>
              <Link
                href={`/b/${business.slug}/claim`}
                className="btn btn--claim-compact"
                data-track="sidebar_claim_click"
              >
                ⚡ Claim in 30s
              </Link>
            </div>
          ) : null}

          {!business.isPublicService ? (
            <div className="business-profile-contact__trust">
              <span>
                <Icon name="shield" />
              </span>
              <div>
                <strong>{p.saferContact}</strong>
                <p>{p.saferContactBody}</p>
              </div>
            </div>
          ) : null}

          {!business.isOwner ? (
            <Link href={`/report?business=${business.id}`} className="business-profile-report">
              {business.isPublicService ? p.suggestCorrection : p.reportBusiness}
            </Link>
          ) : null}
        </aside>
      </div>

      {/* Sticky Quick-Action Bar on mobile viewports */}
      <div className="business-profile-sticky-bar" aria-label={p.quickContactActions}>
        {business.primaryPhone ? (
          <a
            href={`tel:${business.primaryPhone}`}
            data-track="sticky_call_click"
            className="btn btn--sticky-call"
          >
            <Icon name="phone" /> Call
          </a>
        ) : null}
        {!business.isPublicService && waEnquiryUrl ? (
          <a
            href={waEnquiryUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-track="sticky_whatsapp_click"
            className="btn btn--sticky-wa"
          >
            <Icon name="message" /> WhatsApp
          </a>
        ) : null}
        {directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-track="sticky_directions_click"
            className="btn btn--sticky-dir"
          >
            <Icon name="location" /> Directions
          </a>
        ) : null}
      </div>
    </div>
  );
}

function formatProfileDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(`${locale}-IN`, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function currentIndiaDay(): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}

function storefrontCategoryLabel(name: string, categoryName: string): string {
  if (categoryName.trim().toLowerCase() !== 'other local businesses') return categoryName;
  if (
    /\b(badminton|cricket|football|tennis|volleyball|basketball|skating|swimming|kabaddi|athletics?|sports?|turf|stadium|arena)\b/i.test(
      name,
    )
  ) {
    return 'Sports & fitness';
  }
  if (/\b(gym|fitness|yoga|crossfit|zumba|aerobics|workout)\b/i.test(name)) {
    return 'Fitness & wellness';
  }
  if (/\b(coaching|tuition|institute|classes|academy|iit|neet|upsc)\b/i.test(name)) {
    return 'Education & training';
  }
  return categoryName;
}

function storefrontArtworkCategory(name: string, categoryName: string): string {
  const label = storefrontCategoryLabel(name, categoryName);
  if (label === 'Sports & fitness') return 'Sports, fitness & outdoors';
  if (label === 'Fitness & wellness') return 'Fitness & gym equipment';
  if (label === 'Education & training') return 'Education & training';
  return categoryName;
}

function currentOpenState(
  hours: BusinessHour[],
  labels: Record<string, string>,
): { isOpen: boolean; label: string } {
  if (!hours.length) return { isOpen: false, label: labels.hoursNotListed };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  const todayHours = hours.filter((hour) => hour.dayOfWeek === currentIndiaDay());
  const openSlot = todayHours.find(
    (hour) => !hour.isClosed && parts >= hour.opensAt && parts <= hour.closesAt,
  );
  if (openSlot)
    return {
      isOpen: true,
      label: labels.openUntil.replace('{time}', formatClock(openSlot.closesAt)),
    };
  const next = todayHours.find((hour) => !hour.isClosed && parts < hour.opensAt);
  return {
    isOpen: false,
    label: next ? labels.opensAt.replace('{time}', formatClock(next.opensAt)) : labels.closedToday,
  };
}

function formatHour(hour: BusinessHour, labels: Record<string, string>): string {
  return hour.isClosed
    ? labels.closed
    : `${formatClock(hour.opensAt)} – ${formatClock(hour.closesAt)}`;
}

function formatClock(value: string): string {
  const [hour, minute] = value.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(-10);
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function formatDistance(meters: number, t: (key: string) => string): string {
  return meters < 1000
    ? `${Math.round(meters)} ${t('common.m')}`
    : `${(meters / 1000).toFixed(1)} ${t('common.km')}`;
}
