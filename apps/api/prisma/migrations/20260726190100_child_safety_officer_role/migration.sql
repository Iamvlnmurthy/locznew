-- This migration intentionally follows the enum migration: PostgreSQL requires a newly
-- added enum value to be committed before it can be used in a row.
INSERT INTO "roles" (
  "id",
  "name",
  "description",
  "permissions",
  "createdAt",
  "updatedAt"
)
VALUES (
  '019d469a-6f80-7000-8000-000000000001',
  'CHILD_SAFETY_OFFICER',
  'Named officer handling restricted child-safety cases',
  ARRAY[
    'safety:case:read',
    'safety:evidence:read',
    'safety:case:report',
    'safety:case:release',
    'safety:case:close'
  ]::TEXT[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE SET
  "description" = EXCLUDED."description",
  "permissions" = EXCLUDED."permissions",
  "updatedAt" = CURRENT_TIMESTAMP;
