import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Prisma 7 connects through a driver adapter rather than its own bundled engine, so
    // the connection string is supplied here rather than in schema.prisma. The pool size
    // comes from `connection_limit` in DATABASE_URL — see docs/SETUP.md on sizing it
    // against the database's max_connections.
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
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
