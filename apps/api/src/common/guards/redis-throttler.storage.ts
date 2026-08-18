import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../../redis/redis.service';

/**
 * Rate-limit counters in Redis rather than in each process's memory.
 *
 * `ThrottlerModule`'s default storage is a `Map`, which means every replica keeps its own
 * counters: two API containers behind the proxy allow twice the configured rate, three allow
 * three times it, and the number in the configuration stops describing anything. The limits
 * that matter most here — the OTP endpoints, sign-in, registration — are exactly the ones
 * where that is a security property rather than a tuning detail.
 *
 * Redis is already a hard dependency (queues, OTP windows, idempotency), so this adds no new
 * infrastructure.
 *
 * The increment, its expiry and the block are one Lua script so they cannot interleave. Doing
 * it in three round trips would let two requests both observe `hits == limit` and neither set
 * the block.
 */
const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttlMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockMs = tonumber(ARGV[3])

-- Already blocked: report the remaining block without advancing the counter, so a client
-- that keeps hammering does not extend its own penalty indefinitely.
local blockPttl = redis.call('PTTL', blockKey)
if blockPttl > 0 then
  local held = tonumber(redis.call('GET', hitsKey)) or (limit + 1)
  local heldTtl = redis.call('PTTL', hitsKey)
  if heldTtl < 0 then heldTtl = ttlMs end
  return { held, heldTtl, 1, blockPttl }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then
  redis.call('PEXPIRE', hitsKey, ttlMs)
end

local hitsPttl = redis.call('PTTL', hitsKey)
if hitsPttl < 0 then
  -- A key with no expiry would count forever. Should not happen, but a counter that never
  -- resets locks a caller out permanently, so it is repaired rather than trusted.
  redis.call('PEXPIRE', hitsKey, ttlMs)
  hitsPttl = ttlMs
end

if hits > limit then
  redis.call('SET', blockKey, 1, 'PX', blockMs)
  return { hits, hitsPttl, 1, blockMs }
end

return { hits, hitsPttl, 0, 0 }
`;

/** Milliseconds to whole seconds, which is the unit the throttler's record is read in. */
const toSeconds = (milliseconds: number): number => Math.max(0, Math.ceil(milliseconds / 1000));

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitsKey}:blocked`;

    try {
      const [hits, hitsPttl, blocked, blockPttl] = (await this.redis.client.eval(
        INCREMENT_SCRIPT,
        2,
        hitsKey,
        blockKey,
        String(ttl),
        String(limit),
        String(blockDuration || ttl),
      )) as [number, number, number, number];

      return {
        totalHits: hits,
        timeToExpire: toSeconds(hitsPttl),
        isBlocked: blocked === 1,
        timeToBlockExpire: toSeconds(blockPttl),
      };
    } catch (error) {
      // Fails open, loudly. A rate limiter that takes the API down when Redis blinks has
      // caused the outage it exists to prevent — but this must be visible, because it means
      // the platform is briefly running with no limits at all.
      this.logger.error(
        `Rate-limit storage unavailable, allowing the request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { totalHits: 0, timeToExpire: toSeconds(ttl), isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
