import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { RequestWithUser } from '../decorators/current-user.decorator';
import { RedisService } from '../../redis/redis.service';

interface CachedResponse {
  status: 'in-flight' | 'complete';
  body?: unknown;
}

/**
 * Honours the `Idempotency-Key` header on unsafe requests.
 *
 * The case this exists for: a seller on a patchy connection taps "Publish", the response
 * is lost in transit, and they tap again. Without this they get two identical listings
 * and a duplicate-detection flag against their own account.
 *
 * The key is namespaced per user, so one client cannot replay or observe another's
 * response by guessing a key.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  /** Long enough to cover a retry, short enough that a deliberate repost still works. */
  private static readonly TTL_SECONDS = 24 * 60 * 60;

  /**
   * How long an unfinished request holds its key.
   *
   * Much shorter than the completed-response TTL, and separate from it on purpose. The
   * in-flight marker used to be written with the full day: if the process died mid-request —
   * a deploy, a crash, a client that hung up — the `error` handler that clears it never ran,
   * and that key answered 409 for twenty-four hours. A minute covers any request this API
   * legitimately serves and expires on its own if nothing comes back.
   */
  private static readonly IN_FLIGHT_TTL_SECONDS = 60;

  /**
   * Paths where replaying a stored response would be worse than repeating the work.
   *
   * The authentication routes return tokens. Caching one for a day means a credential sitting
   * in Redis, and replaying it hands the same session to whoever presents the key again —
   * neither of which is what a client asking for idempotent posting had in mind. Sign-in is
   * also not an operation anybody needs to be idempotent: repeating it issues a new session,
   * which is the correct outcome.
   */
  private static readonly EXCLUDED = ['/auth/'];

  constructor(private readonly redis: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const header = request.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;

    // Only mutating requests, and only when the client asked for the guarantee.
    if (!key || !['POST', 'PATCH', 'PUT'].includes(request.method)) {
      return next.handle();
    }

    if (IdempotencyInterceptor.EXCLUDED.some((prefix) => request.url.includes(prefix))) {
      return next.handle();
    }

    const scope = request.user?.id ?? request.ip ?? 'anonymous';
    const cacheKey = `idem:${scope}:${key.slice(0, 128)}`;

    return from(this.redis.getJson<CachedResponse>(cacheKey)).pipe(
      switchMap((cached) => {
        if (cached?.status === 'complete') {
          this.logger.log(`Replaying idempotent response for ${cacheKey}`);
          return of(cached.body);
        }

        if (cached?.status === 'in-flight') {
          // The original is still running. Returning its response would mean waiting on
          // another request; 409 tells the client to retry rather than duplicating work.
          throw new ConflictException(
            'That request is still being processed. Please wait a moment.',
          );
        }

        return from(
          this.redis.setIfAbsent(
            cacheKey,
            JSON.stringify({ status: 'in-flight' }),
            IdempotencyInterceptor.IN_FLIGHT_TTL_SECONDS,
          ),
        ).pipe(
          switchMap((claimed) => {
            if (!claimed) {
              throw new ConflictException(
                'That request is still being processed. Please wait a moment.',
              );
            }

            return next.handle().pipe(
              tap({
                next: (body) => {
                  void this.redis.setJson(
                    cacheKey,
                    { status: 'complete', body } satisfies CachedResponse,
                    IdempotencyInterceptor.TTL_SECONDS,
                  );
                },
                error: () => {
                  // A failed attempt must not be replayed as a success, and must not
                  // block the client from trying again.
                  void this.redis.del(cacheKey);
                },
              }),
            );
          }),
        );
      }),
    );
  }
}
