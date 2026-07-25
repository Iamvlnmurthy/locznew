import { ModerationDecision } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RuleBasedModerationProvider } from '../src/moderation/rule-based-moderation.provider';
import { ModerationSubject } from '../src/moderation/moderation-provider.interface';

/**
 * The rules provider decides whether a free listing goes live, waits for a human, or is
 * blocked. Getting it wrong is either a spam flood or a censored genuine seller, so the
 * thresholds are pinned by tests rather than left to inspection.
 */
describe('RuleBasedModerationProvider', () => {
  const bannedKeywords = [
    { keyword: 'instant loan', severity: 2, scope: 'ALL', isActive: true },
    { keyword: 'advance payment', severity: 1, scope: 'ALL', isActive: true },
  ];

  const prisma = {
    bannedKeyword: { findMany: jest.fn().mockResolvedValue(bannedKeywords) },
  } as unknown as PrismaService;

  const provider = new RuleBasedModerationProvider(prisma);

  const baseSubject: ModerationSubject = {
    ownerId: 'owner-1',
    type: 'PRODUCT',
    title: 'Samsung 43 inch smart TV in good condition',
    description:
      'Bought two years ago, moving cities so selling. Includes the original remote and box. Working perfectly.',
    price: 18000,
    contactPhone: null,
    ownerPublishedCount: 10,
    isDuplicate: false,
  };

  it('auto-approves a clean listing from an established seller', async () => {
    const verdict = await provider.evaluate(baseSubject);

    expect(verdict.decision).toBe(ModerationDecision.AUTO_APPROVE);
    expect(verdict.score).toBeLessThan(20);
  });

  it('sends a first-time poster to human review even when the listing is clean', async () => {
    const verdict = await provider.evaluate({ ...baseSubject, ownerPublishedCount: 0 });

    expect(verdict.decision).toBe(ModerationDecision.REVIEW);
    expect(verdict.reasons).toContain('NEW_ACCOUNT');
  });

  it('auto-rejects a severity-2 banned keyword on its own', async () => {
    const verdict = await provider.evaluate({
      ...baseSubject,
      description: 'Get an instant loan approved today, no documents needed.',
    });

    expect(verdict.decision).toBe(ModerationDecision.AUTO_REJECT);
    expect(verdict.reasons).toContain('BANNED_KEYWORD:instant loan');
  });

  it('does not reject on a single soft signal alone', async () => {
    const verdict = await provider.evaluate({
      ...baseSubject,
      description: `${baseSubject.description} Reach me at seller@example.com`,
    });

    expect(verdict.reasons).toContain('EMAIL_IN_BODY');
    expect(verdict.decision).not.toBe(ModerationDecision.AUTO_REJECT);
  });

  it('flags a shortened link, the classic scam vector', async () => {
    const verdict = await provider.evaluate({
      ...baseSubject,
      description: 'Full details at bit.ly/cheap-tv-offer, message fast.',
    });

    expect(verdict.reasons).toContain('SHORTENED_URL');
    expect(verdict.decision).toBe(ModerationDecision.REVIEW);
  });

  it('flags a repost of an identical listing', async () => {
    const verdict = await provider.evaluate({ ...baseSubject, isDuplicate: true });

    expect(verdict.reasons).toContain('DUPLICATE_LISTING');
    expect(verdict.decision).toBe(ModerationDecision.REVIEW);
  });

  it('accumulates soft signals into a rejection', async () => {
    const verdict = await provider.evaluate({
      ...baseSubject,
      title: 'URGENT SALE!!!',
      description: 'Pay advance payment first. Call 9876543210 or 9876543211. bit.ly/deal',
    });

    expect(verdict.decision).toBe(ModerationDecision.AUTO_REJECT);
  });

  it('caps the reported score at 100', async () => {
    const verdict = await provider.evaluate({
      ...baseSubject,
      title: 'INSTANT LOAN!!!',
      description: 'instant loan advance payment bit.ly/x 9876543210 9876543211 a@b.com',
    });

    expect(verdict.score).toBeLessThanOrEqual(100);
  });
});
