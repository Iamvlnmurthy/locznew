import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestWithUser } from '../decorators/current-user.decorator';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Threads one id through logs, audit entries and error responses so a user-reported
 * failure can be traced across API, worker and admin without guesswork. A client-supplied
 * id is honoured — the mobile app generates one per user action, which links the retry
 * to the original attempt.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: RequestWithUser, response: Response, next: NextFunction): void {
    const incoming = request.headers[CORRELATION_ID_HEADER];
    const correlationId =
      (Array.isArray(incoming) ? incoming[0] : incoming)?.slice(0, 64) || randomUUID();

    request.correlationId = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
