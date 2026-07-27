import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

/**
 * The database every maintenance script writes to.
 *
 * These scripts are the ones that load a country's worth of geography, generate load data
 * and seed accounts — the operations where connecting to the wrong database is worst. Each
 * of them used to pass `process.env.DATABASE_URL` straight to the driver, and `pg` treats an
 * undefined connection string as an invitation to use its own defaults: `localhost:5432`, as
 * the current operating-system user, no password.
 *
 * On a developer's laptop that fails immediately and harmlessly. On a server that happens to
 * run a second PostgreSQL — which is exactly where these scripts get run — it succeeds
 * against *a* database and reports "authentication failed" or, worse, silently writes to
 * someone else's. That is what happened deploying to a host running eleven unrelated
 * databases: `import-pincodes.ts` had no dotenv import, so it reached for the wrong server.
 *
 * Loading the environment here means one place gets it right, and refusing to return a
 * connection string turns a silent misconnection into an immediate, obvious failure.
 */
export function databaseUrl(): string {
  // The repository root, three levels up from `apps/api/prisma`.
  loadEnv({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Refusing to continue: without it the driver would fall back ' +
        'to localhost:5432 as the current user, which on a shared host is a different ' +
        'database rather than an error. Check that .env exists at the repository root.',
    );
  }
  return url;
}
