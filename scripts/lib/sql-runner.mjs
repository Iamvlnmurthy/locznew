#!/usr/bin/env node
/**
 * Runs one SQL statement and prints the result the way `psql -tAc` does.
 *
 *   node scripts/lib/sql-runner.mjs "SELECT count(*) FROM listings"
 *
 * This exists so the acceptance gates do not depend on a `psql` binary. They used to, and
 * the dependency was invisible until a machine without the PostgreSQL client tools ran the
 * gate: two suites aborted with `spawnSync psql ENOENT`, which reads like a broken gate
 * rather than a missing package. The `pg` driver is already in the tree — the application
 * itself talks to PostgreSQL through it — so the gate can use the same connection the app
 * uses and stop asking the machine for anything extra.
 *
 * The output format is deliberately `psql -tAc`: tuples only, unaligned, tab-separated,
 * no header. That is what the callers already parse, and matching it means the change is
 * confined to how the bytes are produced.
 *
 * The statement arrives as argv rather than through the shell, and the password only ever
 * travels in the environment, so neither can appear in a process list.
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';

/** The same DATABASE_URL the application reads, so the gate cannot test a different database. */
function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const file = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const match = /^DATABASE_URL=(.+)$/m.exec(file);
  const raw = match?.[1].trim().replace(/^"|"$/g, '');
  if (!raw) throw new Error('DATABASE_URL not found in the environment or .env');
  return raw;
}

const statement = process.argv[2];
if (!statement) {
  console.error('usage: sql-runner.mjs "<statement>"');
  process.exit(2);
}

/**
 * One value, rendered the way psql renders it.
 *
 * The driver is more helpful than psql: it parses values into JavaScript types, so a boolean
 * arrives as `true` where psql prints `t`. Callers assert against the psql spelling, so the
 * helpfulness has to be undone here — otherwise this is a subtly different tool wearing the
 * same interface, which is worse than an obviously different one.
 */
function render(value) {
  if (value === null || value === undefined) return ''; // psql prints NULL as empty here
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '\\x' + value.toString('hex');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const client = new Client({ connectionString: connectionString() });

try {
  await client.connect();
  const result = await client.query({ text: statement, rowMode: 'array' });

  // A multi-statement string yields an array of results; psql prints each in turn.
  for (const part of Array.isArray(result) ? result : [result]) {
    for (const row of part.rows ?? []) {
      process.stdout.write(row.map(render).join('\t'));
      process.stdout.write('\n');
    }
  }
} catch (error) {
  // psql writes its diagnostics to stderr and exits non-zero; callers rely on both.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
