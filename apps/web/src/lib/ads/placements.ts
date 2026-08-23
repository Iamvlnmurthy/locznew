/**
 * Where LocZ allows advertising, and under what rules.
 *
 * A page asks for a *placement*, never for a provider. `<AdSlot placement="BUSINESS_AFTER_ABOUT" />`
 * says where in the document an advertisement may go; this file decides whether anything
 * renders there, on which devices, and from whom. That indirection is the point: the
 * business template is on ~3 million URLs, and swapping AdSense for Ad Manager, or for a
 * directly-sold local campaign, must not mean editing a page component.
 *
 * Everything defaults to OFF. Deploying this code changes nothing until the environment
 * turns a placement on, which is what makes it safe to ship before AdSense has approved
 * the site.
 */

export type Device = 'mobile' | 'desktop' | 'both';

export type PlacementId =
  | 'BUSINESS_AFTER_ABOUT'
  | 'BUSINESS_AFTER_LOCATION'
  | 'BUSINESS_BEFORE_NEARBY'
  | 'HOME_AFTER_LOCAL_NOW'
  | 'HOME_AFTER_BUSINESSES'
  | 'SEARCH_IN_FEED';

export interface Placement {
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
    device: 'both',
    reserve: { mobile: 280, desktop: 280 },
    lazy: false,
    minContentScore: 0,
  },
  // Desktop only to start with: on a phone this would sit between the address and
  // the FAQ, which is a lot of advertising for a page someone opened to get a
  // phone number.
  BUSINESS_AFTER_LOCATION: {
    device: 'desktop',
    reserve: { mobile: 280, desktop: 280 },
    lazy: true,
    minContentScore: 2,
  },
  // Before the nearby list, never inside it. Those internal links matter for both
  // navigation and SEO, and an ad among them would read as a result.
  BUSINESS_BEFORE_NEARBY: {
    device: 'both',
    reserve: { mobile: 280, desktop: 250 },
    lazy: true,
    minContentScore: 1,
  },
  HOME_AFTER_LOCAL_NOW: {
    device: 'both',
    reserve: { mobile: 280, desktop: 250 },
    lazy: true,
    minContentScore: 0,
  },
  HOME_AFTER_BUSINESSES: {
    device: 'both',
    reserve: { mobile: 280, desktop: 250 },
    lazy: true,
    minContentScore: 0,
  },
  SEARCH_IN_FEED: {
    device: 'both',
    reserve: { mobile: 280, desktop: 250 },
    lazy: true,
    minContentScore: 0,
  },
};

/**
 * Environment, read once.
 *
 * `NEXT_PUBLIC_ADS_ENABLED` is the global kill switch — one variable and a restart
 * turns off every advertisement on the site without a frontend deploy, which is what
 * you want when a policy warning arrives at nine on a Sunday evening.
 *
 * Per-placement slot ids come from AdSense and are public (they appear in the markup
 * of every page that carries an ad), so they belong in NEXT_PUBLIC_ configuration
 * rather than a secret store. A placement with no slot id stays dark.
 */
const env = (name: string) => process.env[name]?.trim() || '';

export const ADS_ENABLED = env('NEXT_PUBLIC_ADS_ENABLED') === 'true';
export const ADS_CLIENT = env('NEXT_PUBLIC_ADSENSE_CLIENT');

const SLOT_ENV: Record<PlacementId, string> = {
  BUSINESS_AFTER_ABOUT: 'NEXT_PUBLIC_AD_SLOT_BUSINESS_AFTER_ABOUT',
  BUSINESS_AFTER_LOCATION: 'NEXT_PUBLIC_AD_SLOT_BUSINESS_AFTER_LOCATION',
  BUSINESS_BEFORE_NEARBY: 'NEXT_PUBLIC_AD_SLOT_BUSINESS_BEFORE_NEARBY',
  HOME_AFTER_LOCAL_NOW: 'NEXT_PUBLIC_AD_SLOT_HOME_AFTER_LOCAL_NOW',
  HOME_AFTER_BUSINESSES: 'NEXT_PUBLIC_AD_SLOT_HOME_AFTER_BUSINESSES',
  SEARCH_IN_FEED: 'NEXT_PUBLIC_AD_SLOT_SEARCH_IN_FEED',
};

export function slotIdFor(placement: PlacementId): string {
  return env(SLOT_ENV[placement]);
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
