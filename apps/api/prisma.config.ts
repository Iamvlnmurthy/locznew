import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// `dotenv/config` resolves against the working directory, which is apps/api whenever npm
// runs a workspace script — so the repository-root .env is loaded explicitly too. Values
// already in the environment win; this only fills the gaps.
loadEnv({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });
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

    // `prisma migrate dev` creates and drops a throwaway shadow database to work out the
    // diff. The application role is NOSUPERUSER NOCREATEDB on purpose, so that privilege
    // comes from a separate development-only connection rather than by relaxing the role.
    // Production never needs this: `migrate deploy` applies committed SQL directly.
    //
    // Spread rather than assigned: Prisma validates the key whenever it is present, so an
    // unset SHADOW_DATABASE_URL becomes an empty string and fails `migrate deploy` with
    // "must start with the protocol postgresql://" — in production, where the shadow
    // database is neither configured nor needed.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
