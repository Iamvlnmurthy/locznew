import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v7 as uuid } from 'uuid';
import { matchesKeyword } from '../moderation/rule-based-moderation.provider';
import { PrismaService } from '../prisma/prisma.service';

/** How often the prohibited-word list is re-read. A moderator's addition takes effect within this. */
const KEYWORD_REFRESH_MS = 10 * 60 * 1000;

/** Long enough to be a real search, short enough to exclude pasted rubbish. */
const MAX_QUERY_LENGTH = 120;
const MIN_QUERY_LENGTH = 2;

/**
 * Learns the vocabulary the platform is missing, from what people actually type.
 *
 * A category term list can say what a category *is*. It cannot say what is inside one, and
 * no amount of hand-writing reaches "toor dal", "weighing machine" or "bed bug spray". Every
 * search that returns nothing is somebody telling us a word we do not have, and after a week
 * in one city that is a real list ranked by how often it is typed — which beats anything
 * anyone can infer from a desk.
 *
 * Deliberately not personal. No user id, no device id, no IP. Knowing *that* a word was
 * searched is what improves the platform; knowing *who* searched it only creates a record of
 * what individuals were looking for, which is a liability with no product value. The city is
 * kept because demand is local and learning what one area wants is the entire point.
 */
@Injectable()
export class SearchLearningService implements OnModuleInit {
  private readonly logger = new Logger(SearchLearningService.name);

  /**
   * The prohibited vocabulary, cached because this is consulted on every single search.
   *
   * The same 197 keywords moderation already uses, matched with the same function, so the
   * two can never disagree about what is prohibited. A second list would drift, and the
   * drift would put banned words into a report somebody reads.
   */
  private prohibited: string[] = [];
  private refreshedAt = 0;

  /**
   * Records a search. Never throws, and never blocks the response.
   *
   * A search that succeeded for the user must not fail because logging it did. Callers fire
   * this and move on.
   */
  async onModuleInit(): Promise<void> {
    await this.refreshProhibited();
  }

  record(input: {
    query: string;
    resultCount: number;
    cityId?: string | null;
    pincode?: string | null;
    categoryId?: string | null;
    hadFilters?: boolean;
  }): void {
    const normalised = this.normalise(input.query);
    if (!normalised) return;

    // Prohibited searches are not recorded at all.
    //
    // There is no vocabulary to learn from them — the platform blocks this content on
    // purpose — and storing them would put banned words in front of whoever reads the
    // report, where somebody could reasonably add them to the search terms and end up
    // tuning the product for exactly what it refuses to host. Not writing them also means
    // no log to leak, and nothing to have to explain.
    if (this.isProhibited(normalised)) return;

    void this.refreshProhibitedIfStale();

    void this.prisma.searchQueryLog
      .create({
        data: {
          id: uuid(),
          normalisedQuery: normalised,
          resultCount: input.resultCount,
          isZeroResult: input.resultCount === 0,
          // A zero-result search with filters set is over-narrowing, not missing vocabulary.
          // Keeping them apart stops the term list filling up with words that do exist.
          hadFilters: input.hadFilters ?? false,
          cityId: input.cityId ?? null,
          pincode: input.pincode ?? null,
          categoryId: input.categoryId ?? null,
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not record a search: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  /**
   * What people searched for and did not find, most frequent first.
   *
   * Filtered searches are excluded: those failed because the user narrowed too far, not
   * because a word is missing, and mixing them in would send somebody off adding vocabulary
   * that already exists.
   */
  async missingVocabulary(options: { cityId?: string; days?: number; limit?: number } = {}) {
    const since = new Date(Date.now() - (options.days ?? 30) * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.searchQueryLog.groupBy({
      by: ['normalisedQuery'],
      where: {
        isZeroResult: true,
        hadFilters: false,
        createdAt: { gte: since },
        ...(options.cityId ? { cityId: options.cityId } : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { normalisedQuery: 'desc' } },
      take: Math.min(options.limit ?? 100, 500),
    });

    return rows.map((row) => ({ query: row.normalisedQuery, searches: row._count._all }));
  }

  /**
   * Lower-cased, collapsed whitespace, punctuation trimmed from the ends.
   *
   * Grouping only works if "Best Biryani", "best biryani " and "best biryani?" count as one
   * thing. Anything shorter than two characters or longer than a sentence is dropped: neither
   * is somebody looking for a product, and both would only add noise to the report.
   */
  private normalise(query: string): string | null {
    const cleaned = query
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      .trim();

    if (cleaned.length < MIN_QUERY_LENGTH || cleaned.length > MAX_QUERY_LENGTH) return null;
    return cleaned;
  }

  private isProhibited(query: string): boolean {
    return this.prohibited.some((keyword) => matchesKeyword(query, keyword));
  }

  private async refreshProhibitedIfStale(): Promise<void> {
    if (Date.now() - this.refreshedAt < KEYWORD_REFRESH_MS) return;
    await this.refreshProhibited();
  }

  private async refreshProhibited(): Promise<void> {
    try {
      const rows = await this.prisma.bannedKeyword.findMany({
        where: { isActive: true },
        select: { keyword: true },
      });
      this.prohibited = rows.map((row) => row.keyword);
      this.refreshedAt = Date.now();
    } catch (error) {
      // Keep whatever is cached. Failing open here would start recording prohibited
      // searches, which is the one outcome this whole check exists to prevent.
      this.logger.error(
        `Could not refresh the prohibited list; keeping ${this.prohibited.length} cached: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  constructor(private readonly prisma: PrismaService) {}
}
