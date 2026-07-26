import { ModerationDecision } from '@prisma/client';
import { BANNED_KEYWORDS } from '../prisma/banned-keywords';
import { ModerationSubject } from '../src/moderation/moderation-provider.interface';
import {
  RuleBasedModerationProvider,
  matchesKeyword,
} from '../src/moderation/rule-based-moderation.provider';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * What the platform refuses to carry.
 *
 * Two failures matter here and they pull in opposite directions. Letting an ivory advert
 * through is the obvious one. The quieter one is refusing a salon owner who wants to sell
 * a unisex chair — that seller is told their advert broke the rules, cannot see how, and
 * does not come back. A moderation list is only as good as its false-positive rate, so
 * both directions are tested.
 */
describe('illegal and unethical listings', () => {
  const prisma = {
    bannedKeyword: {
      findMany: jest.fn().mockResolvedValue(
        BANNED_KEYWORDS.map((entry) => ({
          keyword: entry.keyword,
          severity: entry.severity,
          scope: 'ALL',
          isActive: true,
        })),
      ),
    },
  } as unknown as PrismaService;

  const provider = new RuleBasedModerationProvider(prisma);

  /** An established seller, so nothing is flagged merely for being new. */
  function listing(overrides: Partial<ModerationSubject> = {}): ModerationSubject {
    return {
      ownerId: 'owner-1',
      type: 'PRODUCT',
      title: 'Second hand dining table in good condition',
      description:
        'Solid wood dining table with four chairs, used for three years and well maintained.',
      price: 6000,
      contactPhone: null,
      ownerPublishedCount: 25,
      isDuplicate: false,
      ...overrides,
    };
  }

  // ------------------------------------------------------------------ refused
  describe('is refused outright', () => {
    it.each([
      ['wildlife', 'Genuine ivory bangle set', 'Old family piece, elephant tusk carving, rare.'],
      [
        'narcotics',
        'Best quality ganja available',
        'Home delivery in Hyderabad, discreet packing.',
      ],
      ['weapons', 'Katta for sale urgent', 'Country made pistol in working condition with cover.'],
      [
        'sex selection',
        'Sex determination test at home',
        'Know ladka ya ladki before birth, confidential service, results in one day.',
      ],
      [
        'human organs',
        'Kidney for sale genuine donor',
        'Healthy donor available, good amount expected, contact for details.',
      ],
      [
        'abortion pills',
        'MTP kit available without prescription',
        'Mifepristone and misoprostol delivered discreetly to your address.',
      ],
      [
        'e-cigarettes',
        'Vape pen with pods brand new',
        'Imported vape pod device with nicotine salt flavours, sealed box.',
      ],
      [
        'money circulation',
        'Double your money in 30 days',
        'Join our binary income matrix plan, guaranteed returns daily on deposit.',
      ],
      [
        'gambling',
        'Cricket betting id available',
        'Instant betting id with deposit and withdrawal support.',
      ],
      [
        'counterfeits',
        'First copy branded watches',
        'Master copy watch 7a quality, same as original.',
      ],
      [
        'forged documents',
        'Fake experience letter provided',
        'Duplicate marksheet and fake certificate for any university, fast delivery.',
      ],
      [
        'sexual services',
        'Escort service available tonight',
        'Call girl service with full satisfaction.',
      ],
      [
        'stolen goods',
        'IMEI change service for any phone',
        'Stolen phone unlock and imei change done in one hour.',
      ],
      [
        'acid',
        'Concentrated acid sale in bulk',
        'Tezaab available in five litre cans for cleaning.',
      ],
      [
        'child labour',
        'Small boy for shop work needed',
        'Boy 12 years work in grocery shop, food and stay provided.',
      ],
      [
        'dowry',
        'Groom wanted dowry expected',
        'Good family, dahej as per custom, contact parents.',
      ],
    ])('%s', async (_label, title, description) => {
      const verdict = await provider.evaluate(listing({ title, description }));

      expect(verdict.decision).toBe(ModerationDecision.AUTO_REJECT);
    });
  });

  // ------------------------------------------------------------------ held
  describe('is held for a human rather than refused', () => {
    it.each([
      [
        'a chemist advertising medicines',
        'PRODUCT',
        'Prescription medicine home delivery',
        'Licensed chemist delivering prescription medicine across Madhapur within an hour.',
      ],
      [
        'an air rifle, which is licence-dependent rather than banned',
        'PRODUCT',
        'Air rifle for target practice',
        'Used air rifle in good condition with pellets, for practice at home range.',
      ],
      [
        'a landlord filtering tenants',
        'RENTAL',
        'Two bedroom flat available in Gachibowli',
        'Semi furnished flat, only vegetarians preferred, no bachelors, near metro station.',
      ],
      [
        'a job advert about appearance',
        'JOB',
        'Receptionist needed for clinic',
        'Good looking unmarried girls only, front office duties, day shift.',
      ],
      [
        'a job that asks the candidate for money',
        'JOB',
        'Data entry work from home available',
        'Pay registration fee of Rs 500 to receive your work kit and start earning.',
      ],
      [
        'peacock feathers, lawful only if shed',
        'PRODUCT',
        'Peacock feather craft decoration',
        'Handmade wall decoration using naturally shed peacock feather, sixty centimetres.',
      ],
    ])('%s', async (_label, type, title, description) => {
      const verdict = await provider.evaluate(listing({ type, title, description }));

      expect(verdict.decision).not.toBe(ModerationDecision.AUTO_APPROVE);
      expect(verdict.decision).not.toBe(ModerationDecision.AUTO_REJECT);
    });
  });

  // ------------------------------------------------------------------ allowed
  describe('is left alone', () => {
    it.each([
      [
        'a unisex salon chair — the word "sex" inside another word',
        'Unisex salon chair for sale',
        'Hydraulic salon chair used in a unisex parlour for two years, good condition.',
      ],
      [
        'an Essex-branded appliance',
        'Essex water heater 15 litre',
        'Essex brand geyser working perfectly, selling because we are shifting house.',
      ],
      [
        'rice from Ganjam district',
        'Ganjam district organic rice 25kg',
        'Fresh organic rice grown in Ganjam district, sold in twenty five kilo bags.',
      ],
      [
        'a massage chair, where the trade is honest',
        'Massage chair for home use',
        'Full body massage chair with heat function, bought last year, barely used.',
      ],
      [
        'a toy gun',
        'Kids toy gun with soft bullets',
        'Plastic toy gun for children above five years, harmless foam bullets included.',
      ],
      [
        'a cough syrup sold by name in a pharmacy listing is held, but honey is not',
        'Honey based cough remedy homemade',
        'Homemade honey and ginger remedy for winter, no medicines involved, one litre jar.',
      ],
      [
        'a landlord welcoming everyone',
        'Flat for rent, all communities welcome',
        'Two bedroom flat in Kukatpally, tenants of all communities and backgrounds welcome.',
      ],
    ])('%s', async (_label, title, description) => {
      const verdict = await provider.evaluate(listing({ title, description }));

      expect(verdict.decision).toBe(ModerationDecision.AUTO_APPROVE);
    });
  });

  // ------------------------------------------------------------------ the matcher
  describe('word-boundary matching', () => {
    it('does not find a banned word inside an innocent one', () => {
      expect(matchesKeyword('unisex salon chair', 'sex')).toBe(false);
      expect(matchesKeyword('essex water heater', 'sex')).toBe(false);
      expect(matchesKeyword('ganjam district rice', 'ganja')).toBe(false);
    });

    it('finds it when it is genuinely there', () => {
      expect(matchesKeyword('discreet sex services', 'sex')).toBe(true);
      expect(matchesKeyword('selling ganja cheap', 'ganja')).toBe(true);
    });

    it('tolerates whatever separates the words of a phrase', () => {
      for (const text of [
        'sex determination test',
        'sex-determination test',
        'sex   determination test',
        'SEX DETERMINATION TEST',
      ]) {
        expect(matchesKeyword(text, 'sex determination')).toBe(true);
      }
    });

    it('matches at the very start and end of the text', () => {
      expect(matchesKeyword('ganja', 'ganja')).toBe(true);
      expect(matchesKeyword('fresh ganja', 'ganja')).toBe(true);
      expect(matchesKeyword('ganja fresh', 'ganja')).toBe(true);
    });
  });

  // ------------------------------------------------------------------ the corpus
  describe('the corpus itself', () => {
    it('gives every term a category and a legal or policy basis', () => {
      const unexplained = BANNED_KEYWORDS.filter((entry) => !entry.category || !entry.basis);

      // A term nobody can justify is a term that will eventually refuse something honest.
      expect(unexplained).toEqual([]);
    });

    it("contains no duplicates, which would double a listing's score", () => {
      const seen = new Set<string>();
      const duplicates = BANNED_KEYWORDS.filter((entry) => {
        if (seen.has(entry.keyword)) return true;
        seen.add(entry.keyword);
        return false;
      });

      expect(duplicates).toEqual([]);
    });

    it('keeps auto-rejection for things with no innocent reading', () => {
      // Anything ambiguous belongs at severity 1. These categories are where a human has
      // to look, and finding them at severity 2 means someone has been over-zealous.
      const mustBeReviewable = [
        'PRESCRIPTION_DRUGS',
        'DISCRIMINATION',
        'RECRUITMENT_FRAUD',
        'PREDATORY_LENDING',
        'SURVEILLANCE',
        'ANTIQUITIES',
        'TOBACCO',
        'MLM',
        'FAKE_REVIEWS',
        'SCAM_PATTERN',
      ];

      const overreaching = BANNED_KEYWORDS.filter(
        (entry) => mustBeReviewable.includes(entry.category) && entry.severity === 2,
      );

      expect(overreaching).toEqual([]);
    });

    it('is written in the transliterations people actually type', () => {
      // A list that only knows "cannabis" knows nothing about a site written in Hinglish.
      for (const term of ['ganja', 'katta', 'dahej', 'tezaab', 'satta', 'ling janch']) {
        expect(BANNED_KEYWORDS.some((entry) => entry.keyword === term)).toBe(true);
      }
    });
  });
});
