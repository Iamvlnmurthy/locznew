import {
  distanceInMetres,
  matchedSignals,
  qualifiesForAutoApproval,
} from '../src/businesses/claim-signals';

/**
 * Granting a claim without a person reading it.
 *
 * Approving hands over a business's listings, enquiries and identity in search, so the bar has
 * to beat "somebody typed a convincing paragraph". But a queue that makes every real
 * shopkeeper wait days is its own failure — the directory only becomes useful as shops take
 * control of their records.
 *
 * Evidence resolves it, and one rule carries the whole design: an unverified identifier
 * contributes nothing. The directory is public, so matching an unconfirmed phone number
 * against it proves only that the claimant can read a page anybody can read.
 */
describe('claim signals', () => {
  const verified = {
    phoneE164: '+919876543210',
    phoneVerifiedAt: new Date(),
    email: 'ravi@example.com',
    emailVerifiedAt: new Date(),
  };

  // A shop in Madhapur, and a point about 30 m away.
  const shop = {
    primaryPhone: '+919876543210',
    whatsappNumber: null,
    email: 'ravi@example.com',
    latitude: 17.4485,
    longitude: 78.3908,
  };
  const atTheShop = { latitude: 17.4485, longitude: 78.39108, locationAccuracyM: 12 };

  describe('what counts as evidence', () => {
    it('matches a confirmed phone number against the business', () => {
      expect(matchedSignals(verified, shop, {})).toContain('PHONE');
    });

    it('ignores a phone number nobody ever confirmed', () => {
      const unconfirmed = { ...verified, phoneVerifiedAt: null };

      // This is the rule the whole design rests on. The number is printed in a public
      // directory, so matching it unconfirmed proves only that the claimant can read.
      expect(matchedSignals(unconfirmed, shop, {})).not.toContain('PHONE');
    });

    it('ignores an email address nobody ever confirmed', () => {
      const unconfirmed = { ...verified, emailVerifiedAt: null };

      expect(matchedSignals(unconfirmed, shop, {})).not.toContain('EMAIL');
    });

    it('matches a number written in a different format', () => {
      const shopWithLocalFormat = { ...shop, primaryPhone: '09876543210' };

      // Imported records carry whatever the source held. A claim should not fail because a
      // scraper wrote 0 where the account has +91.
      expect(matchedSignals(verified, shopWithLocalFormat, {})).toContain('PHONE');
    });

    it('matches the WhatsApp number too', () => {
      const whatsappOnly = { ...shop, primaryPhone: null, whatsappNumber: '+919876543210' };

      expect(matchedSignals(verified, whatsappOnly, {})).toContain('PHONE');
    });

    it('matches an email whatever case it was typed in', () => {
      expect(matchedSignals(verified, { ...shop, email: 'Ravi@Example.com' }, {})).toContain(
        'EMAIL',
      );
    });
  });

  describe('standing at the shop', () => {
    it('counts a fix within fifty metres', () => {
      expect(matchedSignals(verified, shop, atTheShop)).toContain('LOCATION');
    });

    it('does not count a fix from down the road', () => {
      // Roughly 300 m away.
      const nearby = { latitude: 17.4485, longitude: 78.3936, locationAccuracyM: 12 };

      expect(matchedSignals(verified, shop, nearby)).not.toContain('LOCATION');
    });

    it('refuses a fix too vague to mean anything', () => {
      const vague = { ...atTheShop, locationAccuracyM: 2_000 };

      // A two-kilometre fix whose centre lands next door is not evidence of being there.
      // Accepting it would be worse than having no location signal — it looks like proof.
      expect(matchedSignals(verified, shop, vague)).not.toContain('LOCATION');
    });

    it('refuses a fix that does not say how accurate it is', () => {
      const unstated = { latitude: 17.4485, longitude: 78.39108 };

      expect(matchedSignals(verified, shop, unstated)).not.toContain('LOCATION');
    });

    it('cannot match a business with no coordinates', () => {
      const noGeo = { ...shop, latitude: null, longitude: null };

      expect(matchedSignals(verified, noGeo, atTheShop)).not.toContain('LOCATION');
    });
  });

  describe('the bar', () => {
    it('grants when two independent checks match', () => {
      const signals = matchedSignals(verified, shop, atTheShop);

      expect(qualifiesForAutoApproval(signals)).toBe(true);
    });

    it('refuses on one signal alone', () => {
      // Every single signal has a failure mode one determined person can reach. Standing
      // outside a shop is not hard, and the phone number is printed publicly.
      const phoneOnly = matchedSignals(verified, { ...shop, email: null }, {});

      expect(phoneOnly).toEqual(['PHONE']);
      expect(qualifiesForAutoApproval(phoneOnly)).toBe(false);
    });

    it('refuses a claim with no evidence at all', () => {
      const nothing = matchedSignals(
        { phoneE164: null, phoneVerifiedAt: null, email: null, emailVerifiedAt: null },
        shop,
        {},
      );

      expect(qualifiesForAutoApproval(nothing)).toBe(false);
    });

    it('refuses when both identifiers match but neither is confirmed', () => {
      const unconfirmed = { ...verified, phoneVerifiedAt: null, emailVerifiedAt: null };

      // Two unverified matches are not two signals. They are one fact — the directory is
      // public — counted twice.
      expect(qualifiesForAutoApproval(matchedSignals(unconfirmed, shop, {}))).toBe(false);
    });
  });

  describe('distance', () => {
    it('measures a short hop in metres', () => {
      const metres = distanceInMetres(
        { latitude: 17.4485, longitude: 78.3908 },
        { latitude: 17.4485, longitude: 78.39108 },
      );

      expect(metres).toBeGreaterThan(20);
      expect(metres).toBeLessThan(40);
    });

    it('is zero for the same point', () => {
      const point = { latitude: 17.4485, longitude: 78.3908 };

      expect(distanceInMetres(point, point)).toBeCloseTo(0);
    });
  });
});
