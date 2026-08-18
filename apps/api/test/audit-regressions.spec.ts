import { booleanFromQuery } from '../src/common/dto/boolean-query.transform';
import { escapeLike } from '../src/common/utils/like.util';
import { qualifiesForAutoApproval } from '../src/businesses/claim-signals';

/**
 * The defects a full read of the codebase turned up, each pinned by the smallest test that
 * would have failed before the fix.
 *
 * Grouped in one file on purpose. They have nothing in common domain-wise — a query-string
 * coercion, a wildcard escape, a claim rule — and everything in common in how they survived:
 * each sat under a comment describing the correct behaviour, and nothing executed the claim.
 */
describe('regressions found by inspection', () => {
  describe('boolean query parameters', () => {
    /**
     * `@Type(() => Boolean)` runs `Boolean(value)` and every non-empty string is truthy, so
     * `?verifiedOnly=false` filtered to verified businesses only — and `@IsBoolean()` passed
     * it, because by then it genuinely was a boolean.
     */
    it('reads false as false', () => {
      expect(booleanFromQuery({ value: 'false' })).toBe(false);
      expect(booleanFromQuery({ value: '0' })).toBe(false);
      expect(booleanFromQuery({ value: 'no' })).toBe(false);
      expect(booleanFromQuery({ value: 'off' })).toBe(false);
    });

    it('reads true as true', () => {
      expect(booleanFromQuery({ value: 'true' })).toBe(true);
      expect(booleanFromQuery({ value: '1' })).toBe(true);
      expect(booleanFromQuery({ value: true })).toBe(true);
    });

    /** Neither answer is invented for something that is not a yes or a no. */
    it('leaves anything else absent, for @IsOptional to decide', () => {
      expect(booleanFromQuery({ value: '' })).toBeUndefined();
      expect(booleanFromQuery({ value: undefined })).toBeUndefined();
      expect(booleanFromQuery({ value: 'perhaps' })).toBeUndefined();
      expect(booleanFromQuery({ value: {} })).toBeUndefined();
    });
  });

  describe('LIKE wildcard escaping', () => {
    /**
     * `contains` compiles to LIKE. The listing keyword filter escaped its input and the four
     * other places that build one from user input did not — including the public business
     * directory, where `?q=%a%b%c%` was a sequential scan of 3.4 million rows.
     */
    it('neutralises the characters LIKE treats as wildcards', () => {
      expect(escapeLike('%')).toBe('\\%');
      expect(escapeLike('_')).toBe('\\_');
      expect(escapeLike('%a%b%')).toBe('\\%a\\%b\\%');
    });

    it('escapes the backslash first, so it cannot escape the escapes', () => {
      expect(escapeLike('\\%')).toBe('\\\\\\%');
    });

    it('leaves an ordinary search term alone', () => {
      expect(escapeLike('medical shop')).toBe('medical shop');
    });
  });

  describe('business claim auto-approval', () => {
    /**
     * `LOCATION` is derived entirely from the request body, and the business's coordinates are
     * handed out by the public detail endpoint — so reading them and posting them back with a
     * small accuracy figure is not evidence of standing anywhere. Counting it towards the bar
     * turned "two independent mechanisms" into one, which is the exact failure the file's own
     * header warns about for unverified phone numbers.
     */
    it('refuses a self-asserted location as half of the evidence', () => {
      expect(qualifiesForAutoApproval(['PHONE', 'LOCATION'])).toBe(false);
      expect(qualifiesForAutoApproval(['EMAIL', 'LOCATION'])).toBe(false);
    });

    it('still refuses location on its own', () => {
      expect(qualifiesForAutoApproval(['LOCATION'])).toBe(false);
      expect(qualifiesForAutoApproval([])).toBe(false);
    });

    /** Two identifiers the platform issued a challenge for. Nothing less. */
    it('approves on two challenged identifiers', () => {
      expect(qualifiesForAutoApproval(['PHONE', 'EMAIL'])).toBe(true);
      expect(qualifiesForAutoApproval(['PHONE', 'EMAIL', 'LOCATION'])).toBe(true);
    });
  });
});
