import { SearchKeyword } from './search-keyword';

/**
 * The database keyword path — what answers a search while Meilisearch is down.
 *
 * These assert the *shape* of the filter rather than running it, which is a real limit: they
 * prove the query asks Postgres the right question, not that Postgres answers it as expected.
 * The behaviour itself is covered end to end by `scripts/acceptance-filters.mjs`. What they do
 * catch is the class of mistake that caused the original bug — a filter that silently matches
 * everything, or that quietly replaces a filter it was supposed to sit beside.
 */
describe('SearchKeyword.filter', () => {
  /**
   * Every text comparison in the filter, at whatever depth it sits.
   *
   * Walks the whole structure rather than the two levels the filter happens to use today, so
   * the assertion keeps holding if the shape is rearranged.
   */
  function comparisons(filter: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(filter)) return filter.flatMap(comparisons);
    if (!filter || typeof filter !== 'object') return [];

    const node = filter as Record<string, unknown>;
    const isComparison = 'startsWith' in node || 'contains' in node;
    return [...(isComparison ? [node] : []), ...Object.values(node).flatMap(comparisons)];
  }

  it('never produces an empty filter, which would match the whole catalogue', () => {
    const filter = SearchKeyword.filter('car');

    expect(filter.OR).toBeDefined();
    expect(filter.OR!.length).toBeGreaterThan(0);
    // The original defect was not a wrong match — it was no match at all being applied, so
    // a search returned every published listing. An empty `OR` would do exactly that again.
    expect(JSON.stringify(filter)).toContain('car');
  });

  it('matches the beginning of a word, not the middle of one', () => {
    // The whole point: `car` must reach "Used car" without reaching "scarf". A `contains`
    // filter would satisfy the first and fail the second, so the presence of ` car` with a
    // leading space — and the absence of a bare `contains: 'car'` — is the thing to assert.
    const serialised = JSON.stringify(SearchKeyword.filter('car'));

    expect(serialised).toContain('{"startsWith":"car"');
    expect(serialised).toContain('{"contains":" car"');
    expect(serialised).not.toContain('{"contains":"car"');
  });

  it('searches identity fields and deliberately not the description', () => {
    const filter = SearchKeyword.filter('car');
    const serialised = JSON.stringify(filter);

    expect(serialised).toContain('title');
    expect(serialised).toContain('category');
    expect(serialised).toContain('brand');
    // Descriptions are excluded on purpose. A LIKE over 2000 characters of prose returns the
    // coincidences a search engine would have ranked out of sight — the "carefully" problem.
    expect(serialised).not.toContain('description');
  });

  it('compares case-insensitively', () => {
    const compared = comparisons(SearchKeyword.filter('car'));

    // Someone searching "iphone" must find "iPhone"; every leaf that compares text has to say
    // so, and one that forgets is the kind of omission nobody notices until a seller does.
    expect(compared.length).toBeGreaterThan(0);
    for (const comparison of compared) expect(comparison.mode).toBe('insensitive');
  });

  it('keeps the term intact so a multi-word phrase is not silently split', () => {
    expect(JSON.stringify(SearchKeyword.filter('double door'))).toContain('double door');
  });

  /**
   * `contains` and `startsWith` compile to `LIKE`, and Prisma passes the value through as
   * written. Unescaped, a single `%` matched all 50,021 listings — the same "everything as
   * results" failure this file was written to stop, reachable by typing one character.
   */
  describe('LIKE wildcards typed by the user', () => {
    it('treats a percent sign as a character, not as "match everything"', () => {
      expect(JSON.stringify(SearchKeyword.filter('%'))).toContain('\\\\%');
    });

    it('treats an underscore as a character, not as "match any one"', () => {
      expect(JSON.stringify(SearchKeyword.filter('_'))).toContain('\\\\_');
    });

    it('escapes the backslash first, so it cannot escape the escaping', () => {
      // `\%` must become `\\\%` — the backslash the user typed, then an escaped percent.
      // Escaping in the other order produces `\\%`, which is a literal backslash followed by
      // a live wildcard: the exact bug, reintroduced by a plausible-looking one-line change.
      const filter = JSON.parse(JSON.stringify(SearchKeyword.filter('\\%'))) as unknown;
      const serialised = JSON.stringify(filter);

      expect(serialised).toContain('\\\\\\\\\\\\%');
    });

    it('leaves an ordinary term untouched', () => {
      const serialised = JSON.stringify(SearchKeyword.filter('double door'));

      expect(serialised).not.toContain('\\\\');
      expect(serialised).toContain('double door');
    });

    it('keeps a percent sign searchable rather than stripping it', () => {
      // "100% cotton" is a real title. Escaping must make the character literal, not remove
      // it — a search for it should still be able to find it.
      expect(JSON.stringify(SearchKeyword.filter('100%'))).toContain('100\\\\%');
    });
  });
});
