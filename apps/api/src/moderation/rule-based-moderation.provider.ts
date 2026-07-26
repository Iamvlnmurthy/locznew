import { Injectable, Logger } from '@nestjs/common';
import { ModerationDecision } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ModerationProvider,
  ModerationSubject,
  ModerationVerdict,
} from './moderation-provider.interface';

interface Rule {
  code: string;
  weight: number;
  test: (subject: ModerationSubject, text: string) => boolean;
}

/**
 * Rules-based moderation for Phase 1.
 *
 * Every rule contributes a weight; the total decides auto-approve, human review or
 * auto-reject. Weights are tuned so no single soft signal can reject a listing on its
 * own — only the hard signals (severity-2 banned keywords) reach the reject threshold
 * alone. A false rejection on a free classifieds platform costs a real user their post,
 * so the system is biased toward review rather than rejection.
 */
/**
 * Does this text contain the banned term as words, rather than as letters?
 *
 * The previous check was `text.includes(keyword)`, and with `sex` on the list at severity
 * two that auto-rejected "unisex salon chair for sale" — and "Essex water heater", and a
 * carer advertising for a sexagenarian. A moderation rule that silently refuses honest
 * listings costs more trust than the listing it was meant to stop, because the seller is
 * told their advert broke the rules and cannot see how.
 *
 * Matching is on word boundaries, and a multi-word term tolerates any run of whitespace or
 * punctuation between its words, so "sex determination", "sex-determination" and
 * "sex   determination" are one rule rather than three.
 *
 * What this deliberately does not do is chase obfuscation — g@nja, g a n j a, ｇａｎｊａ.
 * That is an arms race a static list loses, and the weighted signals around it (new
 * account, contact details in the body, duplicate text) are what catch a poster who is
 * actively evading. Pretending otherwise would be the more dangerous mistake.
 */
export function matchesKeyword(text: string, keyword: string): boolean {
  const words = keyword
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (words.length === 0) return false;

  // A plain \b would not fire next to a non-ASCII letter, so the edges are asserted
  // against anything that is not a letter or digit — which keeps Devanagari and Telugu
  // working when a term is written in script rather than transliterated.
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${words.join('[^\\p{L}\\p{N}]+')}($|[^\\p{L}\\p{N}])`,
    'iu',
  );
  return pattern.test(text);
}

@Injectable()
export class RuleBasedModerationProvider implements ModerationProvider {
  readonly name = 'rule-based';
  private readonly logger = new Logger(RuleBasedModerationProvider.name);

  private static readonly AUTO_APPROVE_BELOW = 20;
  private static readonly AUTO_REJECT_AT = 80;
  /** New accounts always get human eyes on their first listings. */
  private static readonly TRUSTED_AFTER_PUBLISHED = 2;

  private static readonly URL_SHORTENERS = [
    'bit.ly',
    'tinyurl.com',
    't.co',
    'goo.gl',
    'ow.ly',
    'is.gd',
    'buff.ly',
    'rb.gy',
    'cutt.ly',
  ];

  private readonly rules: Rule[] = [
    {
      code: 'SHORTENED_URL',
      weight: 45,
      test: (_subject, text) =>
        RuleBasedModerationProvider.URL_SHORTENERS.some((domain) => text.includes(domain)),
    },
    {
      code: 'EXTERNAL_LINK',
      weight: 20,
      test: (_subject, text) => /https?:\/\/|www\./i.test(text),
    },
    {
      code: 'MULTIPLE_PHONE_NUMBERS',
      weight: 25,
      // Contact details belong in the contact fields, where the owner's display
      // preference is honoured. Several numbers in the body is a lead-farming pattern.
      test: (_subject, text) => (text.match(/\b[6-9]\d{9}\b/g) ?? []).length > 1,
    },
    {
      code: 'EMAIL_IN_BODY',
      weight: 15,
      test: (_subject, text) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(text),
    },
    {
      code: 'PAYMENT_UPFRONT_LANGUAGE',
      weight: 30,
      test: (_subject, text) =>
        /(advance|registration|processing)\s+(fee|payment|amount)/i.test(text) ||
        /pay\s+(first|now|advance)/i.test(text),
    },
    {
      // A job that costs money to get is the commonest employment scam in India, and it
      // rarely uses a phrase a keyword list would hold. What gives it away is the shape:
      // a vacancy that mentions the candidate paying something.
      code: 'JOB_ASKS_CANDIDATE_FOR_MONEY',
      weight: 60,
      test: (subject, text) =>
        subject.type === 'JOB' &&
        /(fee|fees|deposit|charges|payment|amount|rs|₹)/i.test(text) &&
        /(pay|paid|deposit|transfer|send)\s+(rs|₹|\d|the|a|an|us|me|amount|money)/i.test(text),
    },
    {
      // Age limits, marital status and appearance in a job advert. Lawful in narrow cases
      // — a women's hostel warden — so this raises suspicion rather than deciding, and a
      // person makes the call.
      code: 'PERSONAL_REQUIREMENT_IN_JOB',
      weight: 25,
      test: (subject, text) =>
        subject.type === 'JOB' &&
        /(unmarried|married|fair\s+complexion|good\s+looking|attractive|below\s+\d{2}\s+years|age\s+below)/i.test(
          text,
        ),
    },
    {
      // A rental advert that filters people rather than describing the property. Same
      // reasoning: held for a human, never auto-refused, because the identical words turn
      // up in a listing objecting to the practice.
      code: 'TENANT_RESTRICTION',
      weight: 25,
      test: (subject, text) =>
        subject.type === 'RENTAL' &&
        /(only\s+(hindus|muslims|christians|brahmins|vegetarians|veg)|no\s+(muslims|hindus|christians|bachelors|sc\s*st|north\s+indians)|caste\s+no\s+bar\s+not)/i.test(
          text,
        ),
    },
    {
      code: 'ALL_CAPS_TITLE',
      weight: 10,
      test: (subject) => subject.title.length > 12 && subject.title === subject.title.toUpperCase(),
    },
    {
      code: 'EXCESSIVE_PUNCTUATION',
      weight: 8,
      test: (subject) => /[!?]{3,}/.test(subject.title),
    },
    {
      code: 'THIN_DESCRIPTION',
      weight: 12,
      test: (subject) => subject.description.trim().length < 25,
    },
    {
      code: 'DUPLICATE_LISTING',
      weight: 50,
      test: (subject) => subject.isDuplicate,
    },
    {
      code: 'SUSPICIOUS_PRICE',
      weight: 15,
      // A ₹1 car is either a mistake or bait. Cheap items legitimately cost little, so
      // this only fires on a price that is implausible for anything.
      test: (subject) =>
        subject.price !== null &&
        subject.price !== undefined &&
        subject.price > 0 &&
        subject.price < 5,
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(subject: ModerationSubject): Promise<ModerationVerdict> {
    const text = `${subject.title}\n${subject.description}`.toLowerCase();
    const reasons: string[] = [];
    let score = 0;

    for (const rule of this.rules) {
      if (rule.test(subject, text)) {
        reasons.push(rule.code);
        score += rule.weight;
      }
    }

    // Banned keywords come from the database so moderators can react to a new scam
    // without a deployment.
    const keywords = await this.prisma.bannedKeyword.findMany({ where: { isActive: true } });
    for (const entry of keywords) {
      const scopeText =
        entry.scope === 'TITLE'
          ? subject.title.toLowerCase()
          : entry.scope === 'DESCRIPTION'
            ? subject.description.toLowerCase()
            : text;

      if (matchesKeyword(scopeText, entry.keyword)) {
        reasons.push(`BANNED_KEYWORD:${entry.keyword}`);
        // Severity 2 alone clears the reject threshold; severity 1 only raises suspicion.
        score += entry.severity >= 2 ? 100 : 25;
      }
    }

    const isNewAccount =
      subject.ownerPublishedCount < RuleBasedModerationProvider.TRUSTED_AFTER_PUBLISHED;
    if (isNewAccount) {
      reasons.push('NEW_ACCOUNT');
    }

    const decision = this.decide(score, isNewAccount);

    if (decision !== ModerationDecision.AUTO_APPROVE) {
      this.logger.log(
        `Listing by ${subject.ownerId} scored ${score} → ${decision} [${reasons.join(', ')}]`,
      );
    }

    return { decision, score: Math.min(score, 100), reasons };
  }

  private decide(score: number, isNewAccount: boolean): ModerationDecision {
    if (score >= RuleBasedModerationProvider.AUTO_REJECT_AT) {
      return ModerationDecision.AUTO_REJECT;
    }
    // A clean listing from a new account still goes to review — this is the single
    // most effective brake on a free-posting spam wave.
    if (isNewAccount) {
      return ModerationDecision.REVIEW;
    }
    return score < RuleBasedModerationProvider.AUTO_APPROVE_BELOW
      ? ModerationDecision.AUTO_APPROVE
      : ModerationDecision.REVIEW;
  }
}
