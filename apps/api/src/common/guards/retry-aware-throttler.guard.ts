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
    const headers = context.switchToHttp().getRequest<Request>().headers;

    // Trust internal loopback calls. Server-side rendering hits this API directly on 127.0.0.1 and so
    // carries NONE of the forwarded-for headers that Cloudflare/LiteSpeed stamp on every external
    // request (the same headers getTracker() below relies on to give each real user their own window).
    // Absence of both is the unambiguous signature of an internal SSR call, so skip the limiter for it.
    // This replaces the x-locz-internal shared-secret bypass, which those same proxies STRIP in transit
    // and which kept silently breaking across process restarts — this check needs no env var at all.
    if (!headers['cf-connecting-ip'] && !headers['x-forwarded-for']) {
      return true;
    }

    // Legacy explicit-key bypass, kept for any caller that still sets it.
    const expected = process.env.INTERNAL_API_KEY;
    if (expected) {
      const header = headers['x-locz-internal'];
      const given = Array.isArray(header) ? header[0] : header;
      if (given && given.length === expected.length) {
        let diff = 0;
        for (let i = 0; i < expected.length; i += 1) {
          diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
        }
        if (diff === 0) return true;
      }
    }
    return super.shouldSkip(context);
  }

  /**
   * Rate-limit by the REAL client IP, not the proxy's.
   *
   * Behind Cloudflare + LiteSpeed, `req.ip` is the proxy address — identical for every visitor — so
   * a per-IP window collapses into one global bucket. The web server dodges it with the internal
   * key above, but the mobile app (a public client that cannot send that key) shares the single
   * bucket with all other public callers and fails intermittently with 429 ("sometimes loads,
   * sometimes doesn't"). Cloudflare puts the true client IP in `cf-connecting-ip`; fall back to the
   * standard forwarded chain, then the socket address, so each user gets their own window again.
   */
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
    const cf = headers['cf-connecting-ip'];
    const xff = headers['x-forwarded-for'];
    const forwarded =
      (Array.isArray(cf) ? cf[0] : cf) ||
      (typeof xff === 'string'
        ? xff.split(',')[0]?.trim()
        : Array.isArray(xff)
          ? xff[0]
          : undefined);
    return Promise.resolve(forwarded || (req.ip as string) || 'unknown');
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
