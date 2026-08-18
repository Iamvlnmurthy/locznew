/**
 * Reads a boolean out of a query string.
 *
 * `@Type(() => Boolean)` calls `Boolean(value)`, and every non-empty string is truthy — so
 * `?verifiedOnly=false` and `?verifiedOnly=0` both arrived as `true`, and `@IsBoolean()` then
 * passed them, because by that point they genuinely were booleans. A filter that cannot be
 * turned off by saying so is worse than one that cannot be turned on: the caller can see it is
 * set to false and the results disagree.
 *
 * Verified against the installed class-transformer:
 *
 *   "false" -> true   "true" -> true   "0" -> true   "" -> false
 *
 * Anything that is not recognisably true or false becomes `undefined`, so `@IsBoolean()` on an
 * optional field lets it through as absent and on a required one rejects it — rather than the
 * transform inventing an answer.
 */
export function booleanFromQuery({ value }: { value: unknown }): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return undefined;

  if (typeof value !== 'string' && typeof value !== 'number') return undefined;

  const normalised = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalised)) return true;
  if (['false', '0', 'no', 'off'].includes(normalised)) return false;
  return undefined;
}
