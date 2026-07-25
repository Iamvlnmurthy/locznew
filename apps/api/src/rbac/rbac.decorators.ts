import { SetMetadata } from '@nestjs/common';
import { RoleName } from '@prisma/client';

export const IS_PUBLIC_KEY = 'locz:isPublic';
export const PERMISSIONS_KEY = 'locz:permissions';
export const ROLES_KEY = 'locz:roles';

/**
 * Marks a route as reachable without authentication. Authentication is on by default
 * (the JWT guard is global), so forgetting this decorator fails closed.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Optional authentication: public listing pages that render extra state ("saved by
 * you") when a token happens to be present, but never require one.
 */
export const OPTIONAL_AUTH_KEY = 'locz:optionalAuth';
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

/** All listed permissions must be held. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Any one of the listed roles suffices. */
export const RequireRoles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
