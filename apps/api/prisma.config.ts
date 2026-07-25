import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * In Prisma 7 the datasource URL no longer lives in `schema.prisma` — the CLI reads it
 * from here, and the runtime client gets its connection from a driver adapter instead
 * (see `src/prisma/prisma.service.ts`). That split is the point of the change: the
 * schema describes shape, this file describes connectivity.
 */
export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
    seed: 'ts-node prisma/seed.ts',
  },

  datasource: {
    // Migrations and introspection use the direct connection: DDL cannot run through a
    // transaction pooler. Falls back to DATABASE_URL when no pooler is in front.
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  },
});
