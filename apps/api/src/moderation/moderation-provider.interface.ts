import { type ModerationDecision } from '@prisma/client';

export const MODERATION_PROVIDER = Symbol('MODERATION_PROVIDER');

/** What a provider is given. Deliberately plain data — no Prisma types, no database access. */
export interface ModerationSubject {
  listingId?: string;
  ownerId: string;
  type: string;
  title: string;
  description: string;
  price?: number | null;
  contactPhone?: string | null;
  /** Listings this owner has already had published — new accounts are treated more carefully. */
  ownerPublishedCount: number;
  /** True when an identical listing already exists for this owner. */
  isDuplicate: boolean;
}

export interface ModerationVerdict {
  decision: ModerationDecision;
  /** 0 (clean) to 100 (certainly abusive). */
  score: number;
  /** Machine-readable reasons, e.g. "BANNED_KEYWORD:instant loan". Shown to moderators. */
  reasons: string[];
}

/**
 * The swap point for automated moderation (ADR-0008). Phase 1 ships a rules provider;
 * an AI provider implements this same interface and changes no call sites.
 */
export interface ModerationProvider {
  readonly name: string;
  evaluate(subject: ModerationSubject): Promise<ModerationVerdict>;
}
