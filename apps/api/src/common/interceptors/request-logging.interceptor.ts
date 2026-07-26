import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, tap } from 'rxjs';
import { RequestWithUser } from '../decorators/current-user.decorator';

/**
 * One structured completion event per request. Payloads and query strings are omitted:
 * operators need timing, route, status and correlation—not somebody's search or form.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpRequest');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();
    const requestRoute = (request as unknown as { route?: { path?: unknown } }).route?.path;
    const requestPath = (request as unknown as { path?: unknown }).path;
    const route =
      typeof requestRoute === 'string'
        ? requestRoute
        : typeof requestPath === 'string'
          ? requestPath
          : request.url.split('?')[0];

    const write = (status: number, level: 'info' | 'error'): void => {
      const event = JSON.stringify({
        level,
        event: 'http_request',
        method: request.method,
        route,
        status,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        correlationId: request.correlationId,
        userId: request.user?.id,
      });
      if (level === 'error') this.logger.error(event);
      else this.logger.log(event);
    };

    return next.handle().pipe(
      tap({
        next: () => write(response.statusCode, 'info'),
        error: (error: unknown) => {
          const status = error instanceof HttpException ? error.getStatus() : 500;
          write(status, status >= 500 ? 'error' : 'info');
        },
      }),
    );
  }
}
