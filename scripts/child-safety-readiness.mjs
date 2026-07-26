#!/usr/bin/env node

/**
 * Read-only child-safety launch gate.
 *
 * It prints counts and policy state, never officer identities, credentials, database
 * addresses, provider references, or case metadata.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..');
const envArgument = process.argv.indexOf('--env');
const envPath = resolve(
  root,
  envArgument >= 0 && process.argv[envArgument + 1] ? process.argv[envArgument + 1] : '.env',
);
const developmentMode = process.argv.includes('--development');
const expectedPermissions = new Set([
  'safety:case:read',
  'safety:evidence:read',
  'safety:case:report',
  'safety:case:release',
  'safety:case:close',
]);
// Add a provider only in the same change that adds its vetted adapter, subscriber-schema
// mapping, configuration validation, and benign integration tests.
const supportedProviders = new Set();
const failures = [];
const warnings = [];
const passes = [];

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function configured(value) {
  return Boolean(
    value?.trim() &&
    !/change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example|todo|tbd/i.test(value.trim()),
  );
}

function validDate(value) {
  if (!configured(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

if (!existsSync(envPath)) {
  fail('Environment file is missing');
}

const fileEnv = existsSync(envPath) ? dotenv.parse(readFileSync(envPath, 'utf8')) : {};
const env = { ...fileEnv, ...process.env };

for (const key of ['CHILD_SAFETY_RUNBOOK_VERSION', 'CHILD_SAFETY_RUNBOOK_APPROVED_BY']) {
  if (configured(env[key])) pass(`${key} is recorded`);
  else fail(`${key} is missing or still a placeholder`);
}

const approvedAt = validDate(env.CHILD_SAFETY_RUNBOOK_APPROVED_AT);
if (!approvedAt) {
  fail('CHILD_SAFETY_RUNBOOK_APPROVED_AT must be a valid timestamp');
} else if (approvedAt.getTime() > Date.now()) {
  fail('CHILD_SAFETY_RUNBOOK_APPROVED_AT cannot be in the future');
} else {
  pass('Child-safety runbook approval date is valid');
}

const reviewAt = validDate(env.CHILD_SAFETY_RUNBOOK_REVIEW_AT);
if (!reviewAt) {
  fail('CHILD_SAFETY_RUNBOOK_REVIEW_AT must be a valid timestamp');
} else if (reviewAt.getTime() <= Date.now()) {
  fail('The child-safety runbook review date has passed');
} else {
  pass('Child-safety runbook review is still current');
}

const provider = env.PROTECTED_HASH_PROVIDER?.trim();
if (supportedProviders.has(provider)) {
  pass('A protected-hash provider compiled into this build is selected');
} else if (
  developmentMode &&
  (!provider || provider === 'unconfigured') &&
  env.NODE_ENV !== 'production'
) {
  warn('Protected-hash provider is unconfigured; accepted only for this development check');
} else if (provider === 'unconfigured' || !provider) {
  fail('A vetted protected-hash provider is not configured');
} else {
  fail(`PROTECTED_HASH_PROVIDER=${provider} is not supported by this build`);
}

if (!configured(env.DATABASE_URL)) {
  fail('DATABASE_URL is missing');
} else {
  const { Client } = pg;
  const db = new Client({
    connectionString: env.DATABASE_URL,
    statement_timeout: 5_000,
    query_timeout: 5_000,
  });
  try {
    await db.connect();
    await db.query('begin read only');
    const result = await db.query(
      `select
         r.permissions,
         count(distinct u.id) filter (where u.status = 'ACTIVE')::int as "activeOfficers",
         count(distinct u.id) filter (
           where u.status = 'ACTIVE'
             and u.email is not null
             and u."passwordHash" is not null
         )::int as "consoleReadyOfficers"
       from roles r
       left join user_roles ur on ur."roleId" = r.id
       left join users u on u.id = ur."userId"
       where r.name = 'CHILD_SAFETY_OFFICER'
       group by r.id, r.permissions`,
    );
    await db.query('commit');

    const role = result.rows[0];
    if (!role) {
      fail('CHILD_SAFETY_OFFICER role is missing');
    } else {
      const actualPermissions = new Set(role.permissions ?? []);
      const exactPermissions =
        actualPermissions.size === expectedPermissions.size &&
        [...expectedPermissions].every((permission) => actualPermissions.has(permission));
      if (exactPermissions) pass('Officer role has exactly the five restricted permissions');
      else fail('Officer role permissions have drifted from the restricted contract');

      if (role.consoleReadyOfficers >= 1) {
        pass('At least one active officer can authenticate to the restricted console');
      } else {
        fail('No active officer can authenticate to the restricted console');
      }
      if (role.activeOfficers >= 2) {
        pass('A second active officer provides operational continuity');
      } else {
        warn('Only one active officer exists; name and train a backup before launch');
      }
    }
  } catch {
    fail('Could not verify the officer role against the database');
  } finally {
    try {
      await db.query('rollback');
    } catch {
      // The transaction was already committed or the connection failed before it began.
    }
    await db.end().catch(() => undefined);
  }
}

console.log('LocZ child-safety readiness');
for (const message of passes) console.log(`  PASS  ${message}`);
for (const message of warnings) console.log(`  WARN  ${message}`);
for (const message of failures) console.log(`  FAIL  ${message}`);
console.log(`\n${passes.length} passed, ${warnings.length} warnings, ${failures.length} failures`);

process.exitCode = failures.length > 0 ? 1 : 0;
