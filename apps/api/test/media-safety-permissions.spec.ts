import { ModerationController } from '../src/moderation/moderation.controller';
import { CHILD_SAFETY_PERMISSIONS } from '../src/rbac/child-safety-role';
import { PERMISSIONS_KEY } from '../src/rbac/rbac.decorators';

describe('restricted media-safety permissions', () => {
  const handlers = [
    ['safetyCases', 'safety:case:read'],
    ['safetyCaseDetail', 'safety:case:read'],
    ['safetyEvidencePreview', 'safety:evidence:read'],
    ['reportSafetyCase', 'safety:case:report'],
    ['releaseSafetyCase', 'safety:case:release'],
    ['closeSafetyCase', 'safety:case:close'],
  ] as const;

  it.each(handlers)('protects %s with only %s', (method, permission) => {
    const handler = ModerationController.prototype[method];

    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([permission]);
    expect(permission).not.toBe('listing:moderate');
  });

  it('gives the officer role exactly the restricted endpoint permissions', () => {
    expect(new Set(CHILD_SAFETY_PERMISSIONS)).toEqual(
      new Set(handlers.map(([, permission]) => permission)),
    );
    expect(CHILD_SAFETY_PERMISSIONS).not.toEqual(
      expect.arrayContaining(['listing:moderate', 'user:manage', 'audit:read', '*']),
    );
  });
});
