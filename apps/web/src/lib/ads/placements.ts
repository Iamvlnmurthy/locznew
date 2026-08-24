/**
 * Where LocZ allows advertising, and under what rules.
 *
 * A page asks for a *placement*, never for a provider. `<AdSlot placement="BUSINESS_AFTER_ABOUT" />`
 * says where in the document an advertisement may go; this file decides whether anything
 * renders there, on which devices, and from whom. That indirection is the point: the
 * business template is on ~3 million URLs, and swapping AdSense for Ad Manager, or for a
 * directly-sold local campaign, must not mean editing a page component.
 *
 * Everything defaults to OFF. Deploying this code changes nothing until the build environment
 * turns a placement on, which is what makes it safe to ship before AdSense has approved the site.
 */

export type Device = 'mobile' | 'desktop' | 'both';
export type AdFormat = 'display' | 'in-feed' | 'in-article' | 'multiplex';

export type PlacementId =
  | 'BUSINESS_AFTER_ABOUT'
  | 'BUSINESS_AFTER_LOCATION'
  | 'BUSINESS_BEFORE_NEARBY'
  | 'HOME_AFTER_LOCAL_NOW'
  | 'HOME_AFTER_BUSINESSES'
  | 'SEARCH_IN_FEED'
  | 'NEWS_ARTICLE_TOP'
  | 'NEWS_ARTICLE_IN_BODY'
  | 'NEWS_FEED_IN_LIST'
  | 'NEWS_ARTICLE_RELATED';

export interface Placement {
  /** The AdSense unit family controls the exact data attributes emitted by AdSlot. */
  readonly format: AdFormat;
  /** Which devices may show this one. Mobile is deliberately more restricted. */
  readonly device: Device;
  /**
   * Height reserved before anything loads, so the page does not jump when the ad
   * arrives. Reserving too little is the usual cause of a bad CLS score; reserving
   * too much leaves a hole when a slot goes unfilled, so these are close to the real
   * height of a responsive display unit at each width.
   */
  readonly reserve: { mobile: number; desktop: number };
  /**
   * A placement below the fold should not compete with the page's own resources.
   * The first ad on a page may load eagerly; the rest wait.
   */
  readonly lazy: boolean;
  /**
   * How much of the page must exist before this slot is allowed. A sparse business
   * page — a name, a phone number and nothing else — should carry one advertisement,
   * not three, and no amount of padding should qualify it for more.
   */
  readonly minContentScore: number;
}

export const PLACEMENTS: Readonly<Record<PlacementId, Placement>> = {
  // After the reader has the identity, the description and the primary actions.
  BUSINESS_AFTER_ABOUT: {
    format: 'in-article',
    device: 'both',
    reserve: { mobile: 280, desktop: 280 },
    lazy: false,
    minContentScore: 0,
  },
  // Desktop only to start with: on a phone this would sit between the address and
  // the FAQ, which is a lot of advertising for a page someone opened to get a
  // phone number.
  BUSINESS_AFTER_LOCATION: {
    format: 'display',
    device: 'desktop',
    reserve: { mobile: 280, desktop: 280 },
    lazy: true,
    minContentScore: 2,
  },
  // Before the nearby list, never inside it. Those internal links matter for both
  // navigation and SEO, and an ad among them would read as a result.
  BUSINESS_BEFORE_NEARBY: {
    format: 'multiplex',
    device: 'both',
    reserve: { mobile: 360, desktop: 340 },
    lazy: true,
    minContentScore: 1,
  },
  HOME_AFTER_LOCAL_NOW: {
    format: 'display',
    device: 'both',
    reserve: { mobile: 280, desktop: 250 },
    lazy: true,
    minContentScore: 4,
  },
  HOME_AFTER_BUSINESSES: {
    format: 'in-feed',
    device: 'both',
    reserve: { mobile: 190, desktop: 190 },
    lazy: true,
    minContentScore: 6,
  },
  SEARCH_IN_FEED: {
    format: 'in-feed',
    device: 'both',
    reserve: { mobile: 190, desktop: 190 },
    lazy: true,
    minContentScore: 6,
  },
  NEWS_ARTICLE_TOP: {
    format: 'display',
    device: 'both',
    reserve: { mobile: 280, desktop: 250 },
    lazy: false,
    minContentScore: 250,
  },
  NEWS_ARTICLE_IN_BODY: {
    format: 'in-article',
    device: 'both',
    reserve: { mobile: 260, desktop: 280 },
    lazy: true,
    minContentScore: 500,
  },
  NEWS_FEED_IN_LIST: {
    format: 'in-feed',
    device: 'both',
    reserve: { mobile: 190, desktop: 190 },
    lazy: true,
    minContentScore: 5,
  },
  NEWS_ARTICLE_RELATED: {
    format: 'multiplex',
    device: 'both',
    reserve: { mobile: 360, desktop: 340 },
    lazy: true,
    minContentScore: 700,
  },
};

/**
 * Environment, read once.
 *
 * `NEXT_PUBLIC_ADS_ENABLED` is the global build-time kill switch. Like every `NEXT_PUBLIC_*`
 * value, Next.js freezes it into the browser bundle during `next build`, so changing it requires
 * a rebuild and restart. Keep the VPS deployment script as the single path for doing both.
 *
 * Per-placement slot ids come from AdSense and are public (they appear in the markup
 * of every page that carries an ad), so they belong in NEXT_PUBLIC_ configuration
 * rather than a secret store. A placement with no slot id stays dark.
 */
const clean = (value: string | undefined) => value?.trim() ?? '';

// These references must stay explicit. Next.js does not inline dynamic lookups such as
// `process.env[name]` into client bundles. A dynamic lookup works during server rendering but
// becomes empty in the browser, which makes React remove the server-rendered ad during hydration.
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';
export const ADS_CLIENT = clean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);

const SLOT_IDS: Readonly<Record<PlacementId, string>> = {
  BUSINESS_AFTER_ABOUT: clean(process.env.NEXT_PUBLIC_AD_SLOT_BUSINESS_AFTER_ABOUT),
  BUSINESS_AFTER_LOCATION: clean(process.env.NEXT_PUBLIC_AD_SLOT_BUSINESS_AFTER_LOCATION),
  BUSINESS_BEFORE_NEARBY: clean(process.env.NEXT_PUBLIC_AD_SLOT_BUSINESS_BEFORE_NEARBY),
  HOME_AFTER_LOCAL_NOW: clean(process.env.NEXT_PUBLIC_AD_SLOT_HOME_AFTER_LOCAL_NOW),
  HOME_AFTER_BUSINESSES: clean(process.env.NEXT_PUBLIC_AD_SLOT_HOME_AFTER_BUSINESSES),
  SEARCH_IN_FEED: clean(process.env.NEXT_PUBLIC_AD_SLOT_SEARCH_IN_FEED),
  NEWS_ARTICLE_TOP: clean(process.env.NEXT_PUBLIC_AD_SLOT_NEWS_ARTICLE_TOP),
  NEWS_ARTICLE_IN_BODY: clean(process.env.NEXT_PUBLIC_AD_SLOT_NEWS_ARTICLE_IN_BODY),
  NEWS_FEED_IN_LIST: clean(process.env.NEXT_PUBLIC_AD_SLOT_NEWS_FEED_IN_LIST),
  NEWS_ARTICLE_RELATED: clean(process.env.NEXT_PUBLIC_AD_SLOT_NEWS_ARTICLE_RELATED),
};

export function slotIdFor(placement: PlacementId): string {
  return SLOT_IDS[placement];
}

/**
 * Whether this placement may render at all.
 *
 * Four independent gates, each of which can turn a slot off on its own: the global
 * switch, the client id, this placement's own slot id, and the page's content score.
 * A placement is only live when every one of them says yes.
 */
export function isPlacementLive(placement: PlacementId, contentScore = 0): boolean {
  if (!ADS_ENABLED || !ADS_CLIENT) return false;
  if (!slotIdFor(placement)) return false;
  return contentScore >= PLACEMENTS[placement].minContentScore;
}
