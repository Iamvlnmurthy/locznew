/**
 * The handful of things a reader does on LocZ that are worth counting.
 *
 * Page views tell you almost nothing about a directory. Somebody who opens a
 * business page and rings the shop got what they came for; somebody who opens it
 * and leaves did not, and both are one pageview. Without these events an extra
 * advertisement could cost calls and directions and show up nowhere at all,
 * which is exactly the comparison the monetisation plan asks for and could not
 * previously make.
 *
 * Deliberately small. Six actions, no user identifiers, no scroll or mouse
 * tracking - the point is to know whether the page works, not to follow people
 * around it.
 */

export type BusinessAction =
  | 'directions_click'
  | 'call_click'
  | 'website_click'
  | 'email_click'
  | 'enquiry_open'
  | 'claim_click'
  | 'share_click';

interface Context {
  /** Which business, so a category or city can be compared later. */
  businessId?: string;
  category?: string;
  city?: string;
  locality?: string | null;
}

/**
 * Fire and forget. Never throws, never blocks the click.
 *
 * An analytics failure must not stop somebody ringing a shop, so every path here
 * is wrapped: a blocked script, an ad blocker, a consent refusal and a typo all
 * end the same way, with the link working and nothing recorded.
 */
export function trackBusinessAction(action: BusinessAction, ctx: Context = {}): void {
  try {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag !== 'function') return;
    gtag('event', action, {
      business_id: ctx.businessId,
      business_category: ctx.category,
      city: ctx.city,
      locality: ctx.locality ?? undefined,
    });
  } catch {
    // Nothing to do and nothing worth telling the reader.
  }
}
