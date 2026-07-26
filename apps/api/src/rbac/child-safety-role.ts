/**
 * Deliberately excludes ordinary moderation and platform-administration powers.
 * Keep this list aligned with the role migration so a named officer receives only
 * the capabilities needed to handle restricted safety cases.
 */
export const CHILD_SAFETY_PERMISSIONS = [
  'safety:case:read',
  'safety:evidence:read',
  'safety:case:report',
  'safety:case:release',
  'safety:case:close',
] as const;
