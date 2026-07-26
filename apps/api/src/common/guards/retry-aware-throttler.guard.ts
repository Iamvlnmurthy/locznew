import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { Response } from 'express';

/**
 * The global rate limiter, made answerable.
 *
 * `ThrottlerGuard` rejects with a bare 429: no indication of how long to wait. Every
 * client then has to guess, and both guesses are bad — too short hammers a server that is
 * already saying stop, too long leaves someone watching a spinner for no reason. This
 * project's own limiters (OTP, enquiries, reports) already state their window; the global
 * one was the exception.
 *
 * RFC 9110 defines the header for exactly this, and the throttler knows the answer — it
 * just never said it out loud.
 */
@Injectable()
export class RetryAwareThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse<Response>();

    // Milliseconds, and a blocked tracker waits out the block rather than the window.
    // Rounded up, never below one second: "retry after 0 seconds" is an invitation to
    // retry immediately, which is what the limit exists to prevent.
    const waitMs = detail.timeToBlockExpire || detail.timeToExpire || 0;
    const seconds = Math.max(1, Math.ceil(waitMs / 1000));

    response.setHeader('Retry-After', String(seconds));

    return super.throwThrottlingException(context, detail);
  }
}
