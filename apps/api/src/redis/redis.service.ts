import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/config.module';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: AppConfig) {
    this.client = new Redis({
      host: config.get('REDIS_HOST'),
      port: config.get('REDIS_PORT'),
      password: config.get('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null, // required by BullMQ, and avoids dropping jobs on blips
      lazyConnect: false,
    });

    this.client.on('error', (error) => this.logger.error(`Redis error: ${error.message}`));
    this.client.on('connect', () => this.logger.log('Redis connected'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Fixed-window counter. Returns the count after incrementing, so a caller can
   * compare against its own limit. The TTL is set only on first increment, which is
   * what makes the window fixed rather than sliding — cheap, and adequate for OTP
   * and posting limits where an exact boundary is not security-critical.
   */
  async incrementWithWindow(key: string, windowSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSeconds);
    }
    return count;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Cache read. Returns null when Redis is unreachable rather than throwing.
   *
   * A cache is an optimisation, so a blip in it must not become a 500 for the caller. It did:
   * when the connection dropped, ioredis rejected every command with "Connection is closed."
   * and that propagated straight out of `/local-now/jobs` and `/local-now/alerts` as a server
   * error. Callers already treat null as "not cached" and recompute, which is the correct
   * behaviour here too. Rate limiting deliberately does NOT get this treatment -- see
   * `incrementWithWindow`, which must fail closed.
   */
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(`Redis read failed for ${key}, treating as a miss: ${String(error)}`);
      return null;
    }
  }

  /** Cache write. Failing to populate a cache is not a reason to fail the request. */
  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    try {
      if (ttlSeconds) {
        await this.client.set(key, payload, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, payload);
      }
    } catch (error) {
      this.logger.warn(`Redis write failed for ${key}: ${String(error)}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  /**
   * Sets a key only if absent. Used for idempotency keys: the first request wins,
   * repeats are recognised without a database round trip.
   */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
