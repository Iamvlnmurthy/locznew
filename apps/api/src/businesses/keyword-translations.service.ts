import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** How long a loaded vocabulary is trusted before it is read again. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * The keyword vocabulary, in the language the page is being served in.
 *
 * Keywords are rendered inside the composed description — "people look here for dal, rice
 * and soap". Once the sentence frame was localised but the terms were not, a Telugu page
 * read as a Telugu sentence with English nouns dropped into it.
 *
 * Held in memory rather than joined per request. It is roughly 1,400 short rows and it is
 * read on every business profile; a join for a fixed vocabulary would be a query per page
 * view for data that changes when somebody runs a translation job, which is to say almost
 * never.
 *
 * A term with no translation falls through to English. That is deliberate and common: a
 * keyword a shop typed itself will never be in this table, and showing the owner's own word
 * is better than hiding it.
 */
@Injectable()
export class KeywordTranslationsService {
  private readonly logger = new Logger(KeywordTranslationsService.name);
  private cache: { te: Map<string, string>; hi: Map<string, string>; at: number } | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Translates the terms shown on a profile.
   *
   * Returns the input unchanged for English, for a language with no vocabulary, and while
   * the vocabulary is still loading — the page must never wait on this or fail because of
   * it, since an English keyword is a working page and a missing one is not.
   */
  localize(keywords: string[], lang?: string | null): string[] {
    const code = lang?.toLowerCase();
    if (code !== 'te' && code !== 'hi') return keywords;

    void this.ensureLoaded();
    const table = this.cache?.[code];
    if (!table) return keywords;

    // Two English terms can share one translation — "grocery store" and "food and beverage
    // store" are both కిరాణా దుకాణం — and the description joins these into a sentence, so a
    // duplicate reads as "people look here for X and X". Deduplicated after translating,
    // keeping the order the terms arrived in.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const keyword of keywords) {
      const translated = table.get(keyword.trim().toLowerCase()) ?? keyword;
      const key = translated.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(translated);
    }
    return out;
  }

  /** Loads the vocabulary once, and again when it goes stale. Never throws to the caller. */
  private async ensureLoaded(): Promise<void> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return;
    if (this.inFlight) return this.inFlight;

    this.inFlight = (async () => {
      try {
        const rows = await this.prisma.keywordTranslation.findMany({
          select: { term: true, nameTe: true, nameHi: true },
        });
        const te = new Map<string, string>();
        const hi = new Map<string, string>();
        for (const row of rows) {
          const key = row.term.trim().toLowerCase();
          if (row.nameTe?.trim()) te.set(key, row.nameTe.trim());
          if (row.nameHi?.trim()) hi.set(key, row.nameHi.trim());
        }
        this.cache = { te, hi, at: Date.now() };
        this.logger.log(`keyword vocabulary loaded: ${te.size} te, ${hi.size} hi`);
      } catch (error) {
        // A failure here must not take a business profile down with it. The previous cache
        // stays in use if there is one; otherwise pages read in English until the next try.
        this.logger.error(
          `could not load keyword translations: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }
}
