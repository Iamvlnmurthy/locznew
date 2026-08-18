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
 *
 * The same rule applies to a signal the claimant supplies about themselves, which is why
 * `LOCATION` cannot make up half of an automatic approval — see `SELF_ASSERTED_SIGNALS`.
 */

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
 * Metres between two points on the earth.
 *
 * Haversine rather than PostGIS: this runs on two points already in memory, and a round trip
 * to the database to compare a pair of coordinates would be slower and no more accurate at
 * this scale.
 */
export function distanceInMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const EARTH_RADIUS_M = 6_371_000;
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

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

/**
 * Signals the claimant produces themselves, which therefore cannot stand on their own.
 *
 * `LOCATION` is the whole set. The other two match a confirmed identifier the platform issued
 * a challenge for — a number Firebase verified, an address Google verified — so defeating one
 * means controlling that identifier. `LOCATION` matches a pair of coordinates the claimant
 * types into the request body against a pair the public business endpoint hands out to
 * anybody who asks. Reading the target's coordinates and posting them back with a small
 * `locationAccuracyM` is not evidence of standing anywhere.
 *
 * That is the same failure this file's header warns about for unverified phone numbers —
 * "one signal and a copy of the public data" — arriving through a different field. Until the
 * fix, PHONE + LOCATION or EMAIL + LOCATION cleared the bar, so the documented requirement
 * for two independent mechanisms was in practice a requirement for one.
 *
 * It is kept rather than deleted because it is real corroboration when it accompanies a
 * challenged identifier, and it is recorded on every claim either way for the reviewer to
 * weigh. It simply cannot be half of an automatic handover.
 *
 * Making it trustworthy is possible — a platform attestation, or repeated fixes over hours
 * rather than one submitted point — and at that stage it can move out of this set.
 */
const SELF_ASSERTED_SIGNALS = new Set<ClaimSignal>(['LOCATION']);

/**
 * Whether the evidence is strong enough that nobody needs to read this claim.
 *
 * Two signals, of which at least two must be ones the claimant could not simply assert. In
 * practice that means PHONE and EMAIL together: a confirmed number matching the directory
 * *and* a verified address matching it. Anything less goes to a human, which is the correct
 * default for handing over a business's listings, enquiries and identity in search.
 */
export function qualifiesForAutoApproval(signals: ClaimSignal[]): boolean {
  const challenged = signals.filter((signal) => !SELF_ASSERTED_SIGNALS.has(signal));
  return challenged.length >= SIGNALS_REQUIRED_FOR_AUTO_APPROVAL;
}
