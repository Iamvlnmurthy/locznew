import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/config.module';
import { AuthenticatedUser, RequestWithUser } from '../common/decorators/current-user.decorator';
import { AccessTokenPayload, TokenService } from '../auth/token.service';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from './rbac.decorators';

/**
 * Global authentication guard — registered app-wide so every route requires a token
 * unless it opts out with @Public or @OptionalAuth. Failing closed is the point:
 * a new endpoint added without thinking about auth is protected, not exposed.
 *
 * Beyond verifying the JWT signature, the guard confirms the session behind it is
 * still active. Without that check a stolen access token would remain usable for its
 * full lifetime after "log out from all devices" — which would make that feature a lie.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, targets);

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      if (isPublic || isOptional) return true;
      throw new UnauthorizedException('Authentication is required for this action');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
      });
    } catch {
      if (isPublic || isOptional) return true; // a stale token must not break public browsing
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!(await this.tokens.isSessionActive(payload.sid))) {
      if (isPublic || isOptional) return true;
      throw new UnauthorizedException('This session is no longer valid. Please sign in again.');
    }

    const user: AuthenticatedUser = {
      id: payload.sub,
      sessionId: payload.sid,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    };
    request.user = user;

    return true;
  }

  private extractToken(request: RequestWithUser): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
