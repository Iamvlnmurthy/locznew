import { Prisma } from '@prisma/client';

/**
 * Keyword matching for the database path — what serves search when Meilisearch is down.
 *
 * Until now there was no such thing. `SearchQueryService` built a browse query for the
 * fallback and dropped the keyword on the way, so an outage turned "car" into "everything":
 * the response was a full, unfiltered catalogue presented as results for a word nobody had
 * matched, with only `usedSearchIndex: false` to hint at it. A degraded search should return
 * fewer results, never wrong ones.
 *
 * Two deliberate limits, because this path cannot and should not imitate a search engine.
 *
 * *Identity fields only* — title, brand and category. Not the description. Meilisearch earns
 * the right to search 2000 characters of prose by ranking what it finds; a `LIKE` cannot
 * rank, so searching descriptions here would return the coincidences without the ordering
 * that normally buries them. This is the same judgement that stops `car` matching an iPhone
 * described as "carefully used".
 *
 * *Word prefixes, not substrings* — `car` matches "Carrom board" and "Used car", and does
 * not match "scarf". `contains` would have been one word shorter and would have reintroduced
 * exactly the bug this exists to avoid.
 *
 * Recall is lower than Meilisearch: no typo tolerance, no relevance ranking, and a word after
 * an opening bracket is missed. That is the intended trade. Everything it returns genuinely
 * contains the word.
 */
/**
 * Makes a user's word safe to put inside a `LIKE` pattern.
 *
 * Prisma's `contains` and `startsWith` compile to `LIKE`, and they pass the value through
 * untouched — so `%` and `_` arrive as wildcards rather than as the characters somebody typed.
 * Searching for `%` matched every listing in the database, which is precisely the failure this
 * whole file exists to prevent, reachable by typing one character. `_` matched any single
 * character, and a pattern like `%a%b%c%` makes PostgreSQL scan the table to answer it.
 *
 * PostgreSQL's `LIKE` treats backslash as the escape character by default, so prefixing the
 * three meaningful characters is enough and no `ESCAPE` clause is needed. Backslash is escaped
 * first, or it would go on to escape the escapes added after it.
 */
function escapeLike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export const SearchKeyword = {
  /**
   * A Prisma filter matching listings whose title, brand or category begins a word with
   * `term`. Callers must place this under `AND` — `whereFor` already uses `OR` for
   * categories, and a second `OR` key would replace it rather than combine with it.
   */
  filter(rawTerm: string): Prisma.ListingWhereInput {
    const insensitive = Prisma.QueryMode.insensitive;
    const term = escapeLike(rawTerm);

    // A word begins either at the start of the value or after a space. Both are needed:
    // `startsWith` alone misses "Used car", `contains: ' car'` alone misses "Car for sale".
    const beginsAWord = (field: 'title') =>
      [
        { [field]: { startsWith: term, mode: insensitive } },
        { [field]: { contains: ` ${term}`, mode: insensitive } },
      ] as Prisma.ListingWhereInput[];

    return {
      OR: [
        ...beginsAWord('title'),
        {
          category: {
            OR: [
              { name: { startsWith: term, mode: insensitive } },
              { name: { contains: ` ${term}`, mode: insensitive } },
            ],
          },
        },
        {
          marketplace: {
            OR: [
              { brand: { startsWith: term, mode: insensitive } },
              { brand: { contains: ` ${term}`, mode: insensitive } },
            ],
          },
        },
      ],
    };
  },
};
