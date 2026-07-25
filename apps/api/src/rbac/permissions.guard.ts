import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { RequestWithUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS_KEY, ROLES_KEY } from './rbac.decorators';

/**
 * Authorisation. Runs after JwtAuthGuard, so `request.user` is populated for any
 * route that declares a requirement.
 *
 * Permissions are carried in the access token rather than re-read per request. That
 * keeps authorisation off the hot path; the cost is that a role change takes effect
 * only at the next token refresh (≤15 minutes). Immediate revocation is handled by
 * revoking the session, which the auth guard checks on every request.
 */
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

    // Super administrator holds the wildcard and bypasses individual checks.
    if (user.permissions.includes('*')) return true;

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
