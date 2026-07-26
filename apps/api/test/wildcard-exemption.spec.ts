import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../src/rbac/rbac.decorators';
import { PermissionsGuard } from '../src/rbac/permissions.guard';
import { CHILD_SAFETY_PERMISSIONS } from '../src/rbac/child-safety-role';

/**
 * The one place where "root can do anything" is a liability.
 *
 * A super administrator's wildcard is a convenience everywhere else: whoever runs the
 * platform should not be locked out of it at three in the morning. Restricted child-safety
 * material is the exception, because the entire point of the separate role is that access
 * is limited to named, trained people and recorded with a justification.
 *
 * The super-administrator credential is also the one most likely to be shared during an
 * incident, held by whoever does deployments, or issued to a contractor. A wildcard that
 * opened this door would undo the separation in a single line — which it did, until this
 * test existed.
 */
describe('the wildcard and child-safety permissions', () => {
  function guardFor(required: string[], permissions: string[]) {
    const reflector = {
      getAllAndOverride: (key: unknown) => (key === PERMISSIONS_KEY ? required : undefined),
    } as unknown as Reflector;

    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'user-1', roles: [], permissions } }),
      }),
    } as unknown as ExecutionContext;

    return { guard: new PermissionsGuard(reflector), context };
  }

  it.each([...CHILD_SAFETY_PERMISSIONS])('a wildcard does not confer %s', (permission) => {
    const { guard, context } = guardFor([permission], ['*']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('an explicit grant does confer it', () => {
    const { guard, context } = guardFor(['safety:evidence:read'], ['safety:evidence:read']);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('a wildcard still confers everything else', () => {
    for (const permission of ['listing:moderate', 'user:manage', 'metrics:read', 'job:run']) {
      const { guard, context } = guardFor([permission], ['*']);
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('a wildcard does not sneak in through a mixed requirement', () => {
    // An endpoint asking for both an ordinary permission and a restricted one must still
    // demand the restricted one explicitly.
    const { guard, context } = guardFor(['listing:moderate', 'safety:evidence:read'], ['*']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('a moderator does not reach it either', () => {
    const { guard, context } = guardFor(
      ['safety:evidence:read'],
      ['listing:moderate', 'report:resolve', 'user:suspend', 'audit:read'],
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('a named officer holds all five and nothing more', () => {
    for (const permission of CHILD_SAFETY_PERMISSIONS) {
      const { guard, context } = guardFor([permission], [...CHILD_SAFETY_PERMISSIONS]);
      expect(guard.canActivate(context)).toBe(true);
    }

    // The other half of the separation: the officer runs safety cases, not the platform.
    for (const permission of ['listing:moderate', 'user:manage', 'metrics:read']) {
      const { guard, context } = guardFor([permission], [...CHILD_SAFETY_PERMISSIONS]);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    }
  });
});
