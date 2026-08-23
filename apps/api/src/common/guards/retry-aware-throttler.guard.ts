import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { Response } from 'express';

export function retryAfterSeconds(
  detail: Pick<ThrottlerLimitDetail, 'timeToBlockExpire' | 'timeToExpire'>,
): number {
  // @nestjs/throttler's storage API already returns both values as whole seconds.
  // Treating them as milliseconds turned a 60-second block into `Retry-After: 1`.
  return Math.max(1, Math.ceil(detail.timeToBlockExpire || detail.timeToExpire || 0));
}

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
  /**
   * The site's own server is not a client.
   *
   * Every server-rendered page calls this API from one machine, so the limiter
   * counted all of locz.in as a single caller and cut it off at 120 requests a
   * minute - about 120 page views. Beyond that, real business pages rendered the
   * error boundary carrying `ThrottlerException: Too Many Requests`, which is a
   * live page telling a reader something went wrong because the site was busy.
   *
   * The header is a shared secret, checked in constant time so a wrong guess
   * cannot be narrowed down by timing, and it is only ever sent from the web
   * server: apps/web/src/lib/api.ts imports next/headers and so never runs in a
   * browser. Browsers and everything else stay rate limited exactly as before.
   */
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected) return super.shouldSkip(context);

    const header = context.switchToHttp().getRequest<Request>().headers['x-locz-internal'];
    const given = Array.isArray(header) ? header[0] : header;
    if (given && given.length === expected.length) {
      let diff = 0;
      for (let i = 0; i < expected.length; i += 1) {
        diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
      }
      if (diff === 0) return true;
    }
    return super.shouldSkip(context);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse<Response>();

    response.setHeader('Retry-After', String(retryAfterSeconds(detail)));

    return super.throwThrottlingException(context, detail);
  }
}
