/**
 * Deciding a claim without a person reading it.
 *
 * A claim hands over a business's listings, its enquiries and its identity in search, so the
 * bar has to be higher than "somebody typed a convincing paragraph". But a queue that makes
 * every real shopkeeper wait days is its own failure: the directory only becomes useful as
 * shops take control of their records, and friction there is the thing that stops it.
 *
 * The resolution is evidence rather than prose. Each signal below is something a claimant
 * cannot simply assert — it has to match a fact the platform already holds, and the claimant
 * has to have proved the identifier is theirs. Two independent signals is the bar.
 *
 * Why two: every single signal has a failure mode that one determined person can reach. The
 * directory is public, so the shop's phone number and address are visible to anybody. Standing
 * outside a shop is not hard. Requiring two independent kinds of evidence means an
 * impersonator has to defeat two different mechanisms at once, which is a materially different
 * problem from defeating one.
 *
 * An unverified identifier contributes nothing. This is the rule that carries the design: if
 * a phone number was typed at sign-up and never confirmed, matching it against the directory
 * proves only that the claimant can read the directory — which everybody can. Counting it
 * would turn "two signals" into "one signal and a copy of the public data".
 */

import { distanceMetres } from '../common/utils/geo-distance';

/** Metres. Tight, because a claimant who is genuinely at the shop is inside this. */
export const LOCATION_MATCH_METRES = 50;

/**
 * The worst location accuracy still worth believing.
 *
 * A fix accurate to two kilometres whose centre lands next door is not evidence of being
 * there, and accepting it would be worse than having no location signal at all — it would
 * look like proof while proving nothing. Devices report accuracy; we hold them to it.
 */
export const MAX_LOCATION_ACCURACY_METRES = 100;

/** How many independent signals must match before nobody needs to read the claim. */
export const SIGNALS_REQUIRED_FOR_AUTO_APPROVAL = 2;

export type ClaimSignal = 'PHONE' | 'EMAIL' | 'LOCATION';

export interface ClaimantIdentity {
  phoneE164: string | null;
  /** Null when the number was typed but never confirmed. An unconfirmed number is not proof. */
  phoneVerifiedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
}

export interface ClaimedBusinessFacts {
  primaryPhone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ClaimEvidence {
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracyM?: number | null;
}

/**
 * Metres between two points on the earth. The implementation now lives in
 * `common/utils/geo-distance` so the feed, listings and this module all share one source;
 * the name is kept here for the claim-signal callers and tests.
 */
export const distanceInMetres = distanceMetres;

/** Compares two Indian numbers by their last ten digits, so +91 and 0 prefixes agree. */
function samePhone(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const digits = (value: string): string => value.replace(/\D/g, '').slice(-10);
  const left = digits(a);
  return left.length === 10 && left === digits(b);
}

function sameEmail(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Which independent checks this claim passes.
 *
 * Returns the signals rather than a yes/no so the caller can record them. A handover that
 * later turns out to be wrong has to be explainable, and "the platform decided" is not an
 * explanation anybody can act on.
 */
export function matchedSignals(
  claimant: ClaimantIdentity,
  business: ClaimedBusinessFacts,
  evidence: ClaimEvidence,
): ClaimSignal[] {
  const signals: ClaimSignal[] = [];

  // Only a confirmed number counts. The directory is public, so an unconfirmed one proves
  // the claimant can read a phone number off a page anybody can read.
  if (
    claimant.phoneVerifiedAt &&
    (samePhone(claimant.phoneE164, business.primaryPhone) ||
      samePhone(claimant.phoneE164, business.whatsappNumber))
  ) {
    signals.push('PHONE');
  }

  if (claimant.emailVerifiedAt && sameEmail(claimant.email, business.email)) {
    signals.push('EMAIL');
  }

  const hasFix =
    evidence.latitude != null &&
    evidence.longitude != null &&
    business.latitude != null &&
    business.longitude != null;

  if (hasFix) {
    const accurateEnough =
      evidence.locationAccuracyM != null &&
      evidence.locationAccuracyM <= MAX_LOCATION_ACCURACY_METRES;

    const metres = distanceInMetres(
      { latitude: evidence.latitude!, longitude: evidence.longitude! },
      { latitude: business.latitude!, longitude: business.longitude! },
    );

    if (accurateEnough && metres <= LOCATION_MATCH_METRES) signals.push('LOCATION');
  }

  return signals;
}

/** Whether the evidence is strong enough that nobody needs to read this claim. */
export function qualifiesForAutoApproval(signals: ClaimSignal[]): boolean {
  return signals.length >= SIGNALS_REQUIRED_FOR_AUTO_APPROVAL;
}
