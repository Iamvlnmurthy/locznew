import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    // Prisma 7 connects through a driver adapter rather than its own bundled engine. We own the pg
    // Pool (instead of letting the adapter make one from a connection string) so we can attach an
    // error handler: when Postgres restarts (e.g. under memory pressure) an idle client emits
    // 'error', and an UNHANDLED EventEmitter error is fatal in Node — which previously wedged every
    // subsequent query with "Cannot use a pool after calling end", 500-ing all pages ("Business not
    // found") until the API was restarted. Handling it lets the pool drop the dead client and open a
    // fresh one on the next query, so a brief DB blip self-heals. Pool size mirrors the old
    // connection_limit=10; keepAlive surfaces dropped sockets promptly.
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      keepAlive: true,
    });
    super({
      adapter: new PrismaPg(pool),
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    this.pool = pool;
    this.pool.on('error', (err: Error) => {
      this.logger.warn(`idle pg client error (pool recovers on next query): ${err.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Soft-deleted rows must never appear in public reads. Prisma has no global
   * middleware for this that survives raw SQL, so the filter is expressed once here
   * and every listing query spreads it rather than re-typing the condition.
   */
  static readonly notDeleted = { deletedAt: null } satisfies Prisma.ListingWhereInput;

  /**
   * Truncates every table except Prisma's migration bookkeeping and PostGIS's
   * `spatial_ref_sys`, which holds reference data rather than application data.
   * Test-only — guarded so a misconfigured environment cannot wipe a real database.
   */
  async truncateAllTables(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('truncateAllTables is not permitted in production');
    }

    const tables = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE '_prisma%'
        AND tablename <> 'spatial_ref_sys'
    `;

    if (tables.length === 0) return;

    const quoted = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  }
}
