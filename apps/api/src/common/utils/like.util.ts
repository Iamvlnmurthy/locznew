/**
 * Makes a user's word safe to put inside a `LIKE` pattern.
 *
 * Prisma's `contains`, `startsWith` and `endsWith` all compile to `LIKE`, and they pass the
 * value through untouched — so `%` and `_` arrive as wildcards rather than as the characters
 * somebody typed. Searching for `%` matched every row in the table, which on the business
 * directory means every one of 3.4 million; `_` matched any single character; and a pattern
 * like `%a%b%c%` makes PostgreSQL scan the whole table to answer it. All three are reachable
 * by typing one character into a public search box.
 *
 * PostgreSQL's `LIKE` treats backslash as the escape character by default, so prefixing the
 * three meaningful characters is enough and no `ESCAPE` clause is needed. Backslash is escaped
 * first, or it would go on to escape the escapes added after it.
 *
 * This lives in `common` rather than beside one caller because it applies to every one of
 * them. It was previously private to the listing keyword filter, and the four other places
 * that build a `contains` from user input — the business directory, the city picker, the
 * pincode typeahead and the admin user search — each carried the bug it exists to prevent.
 */
export function escapeLike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
