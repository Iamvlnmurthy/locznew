import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
  correlationId?: string;
}

/**
 * Injects the authenticated user. On an @OptionalAuth route the value may be
 * undefined, which is why the type is not narrowed here — callers must handle it.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
