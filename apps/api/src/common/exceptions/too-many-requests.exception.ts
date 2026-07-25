import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Nest ships no 429 exception class. Rate limiting appears in several modules
 * (OTP, posting limits, enquiries), so it gets one shared type rather than a
 * hand-rolled HttpException at each call site.
 */
export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too many requests', retryAfterSeconds?: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        error: 'TooManyRequests',
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
