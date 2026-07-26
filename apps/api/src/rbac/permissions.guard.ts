import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { RequestWithUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS_KEY, ROLES_KEY } from './rbac.decorators';
import { CHILD_SAFETY_PERMISSIONS } from './child-safety-role';

/**
 * Authorisation. Runs after JwtAuthGuard, so `request.user` is populated for any
 * route that declares a requirement.
 *
 * Permissions are carried in the access token rather than re-read per request. That
 * keeps authorisation off the hot path; the cost is that a role change takes effect
 * only at the next token refresh (≤15 minutes). Immediate revocation is handled by
 * revoking the session, which the auth guard checks on every request.
 */
/**
 * Permissions no wildcard confers.
 *
 * Everything in the child-safety family: reading a restricted case, previewing evidence,
 * and moving a case through its lifecycle. Held only by an account explicitly granted the
 * role.
 */
const WILDCARD_EXEMPT_PERMISSIONS = new Set<string>(CHILD_SAFETY_PERMISSIONS);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, targets);

    if (!required?.length && !requiredRoles?.length) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) {
      throw new ForbiddenException('Authentication is required for this action');
    }

    // The super administrator's wildcard covers running the platform. It deliberately does
    // not cover the child-safety permissions.
    //
    // Those exist so that access to restricted material is limited to named, trained people
    // and recorded with a justification. A wildcard that opened the same door would undo
    // that in one line — and the super-administrator credential is the one most likely to be
    // held by whoever runs deployments, shared during an incident, or issued to a
    // contractor. "Root can do anything" is a convenience everywhere else and a liability
    // here.
    //
    // A super administrator who genuinely needs this can be granted the role. That grant is
    // then a deliberate, auditable act rather than a side effect of holding the keys.
    const needsExplicitGrant = required?.some((permission) =>
      WILDCARD_EXEMPT_PERMISSIONS.has(permission),
    );

    if (user.permissions.includes('*') && !needsExplicitGrant) return true;

    if (requiredRoles?.length) {
      const hasRole = requiredRoles.some((role) => user.roles.includes(role));
      if (!hasRole) {
        throw new ForbiddenException('Your account does not have access to this area');
      }
    }

    if (required?.length) {
      const missing = required.filter((permission) => !user.permissions.includes(permission));
      if (missing.length > 0) {
        throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
      }
    }

    return true;
  }
}
