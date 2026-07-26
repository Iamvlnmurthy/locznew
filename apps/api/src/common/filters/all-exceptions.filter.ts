import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { RequestWithUser } from '../decorators/current-user.decorator';
import { ErrorReporter } from '../monitoring/error-reporter';

export interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  correlationId?: string;
  timestamp: string;
  path: string;
}

/**
 * One error shape for the whole API, so web, admin and Flutter parse errors identically.
 *
 * Unexpected errors are logged with their stack but answered with a generic message —
 * a Prisma constraint name or a stack frame in a client response is an information leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly reporter: ErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithUser>();

    const { status, code, message, details } = this.translate(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} [${request.correlationId ?? '-'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );

      // Only unexpected failures are reported. A 404 or a validation error is normal
      // traffic; alerting on it trains everyone to ignore the alerts.
      this.reporter.capture(exception, {
        correlationId: request.correlationId,
        userId: request.user?.id,
        route: request.url,
        method: request.method,
      });
    }

    const body: ErrorResponseBody = {
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      correlationId: request.correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // A 429 without Retry-After leaves every client guessing how long to wait, and a
    // guess is either a hammered server or a user staring at a spinner far longer than
    // necessary. The value comes from whichever limiter rejected the request: the OTP
    // and posting limiters know their own window, and the global throttler exposes
    // its reset through this header already.
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const retryAfter = this.retryAfterFor(exception, response);
      if (retryAfter !== undefined) response.setHeader('Retry-After', String(retryAfter));
    }

    response.status(status).json(body);
  }

  private translate(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, code: this.codeFor(status), message: payload };
      }

      const record = payload as Record<string, unknown>;
      const rawMessage = record.message;
      // class-validator returns an array of messages; the first is shown, the rest
      // are returned as details so a form can highlight every invalid field.
      const message = Array.isArray(rawMessage)
        ? String(rawMessage[0])
        : String(rawMessage ?? exception.message);

      return {
        status,
        // Normalised: Nest's built-in exceptions emit human-readable strings such as
        // "Not Found", while ours emit "NotFound". Clients switch on this value, so it
        // must not depend on which layer threw.
        code: this.normaliseCode(String(record.error ?? this.codeFor(status))),
        message,
        details: Array.isArray(rawMessage) ? rawMessage : record.details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            code: 'DuplicateValue',
            message: 'That value is already taken',
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            code: 'NotFound',
            message: 'The requested item does not exist',
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            code: 'InvalidReference',
            message: 'A referenced item does not exist',
          };
        default:
          return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            code: 'DatabaseError',
            message: 'Something went wrong. Please try again.',
          };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'InternalError',
      message: 'Something went wrong. Please try again.',
    };
  }

  /**
   * Seconds a client should wait before retrying, in whole seconds as RFC 9110 requires.
   *
   * Our own limiters carry `retryAfterSeconds` because they know their window exactly.
   * Nest's throttler does not put its reset on the exception, but it has already set the
   * header by the time this filter runs, so that value is kept rather than overwritten
   * with a guess.
   */
  private retryAfterFor(exception: unknown, response: Response): number | undefined {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null && 'retryAfterSeconds' in payload) {
        const seconds = Number((payload as { retryAfterSeconds: unknown }).retryAfterSeconds);
        if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
      }
    }

    const existing = response.getHeader('Retry-After');
    const seconds = Number(existing);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
  }

  /** "Not Found" → "NotFound", "Internal Server Error" → "InternalServerError". */
  private normaliseCode(code: string): string {
    return code.replace(/[^A-Za-z0-9]/g, '');
  }

  private codeFor(status: number): string {
    const codes: Record<number, string> = {
      400: 'BadRequest',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'NotFound',
      409: 'Conflict',
      422: 'ValidationFailed',
      429: 'TooManyRequests',
    };
    return codes[status] ?? 'Error';
  }
}
