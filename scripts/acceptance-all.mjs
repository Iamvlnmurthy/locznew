#!/usr/bin/env node
/**
 * Every HTTP acceptance suite, in one run.
 *
 *   npm run acceptance:all
 *
 * These need a live stack — API, web, admin, PostgreSQL, Redis, Meilisearch and object
 * storage — which is why they are not part of `npm test` and why the release gate treats
 * them as an opt-in stage. A build machine with no database cannot answer the questions
 * they ask.
 *
 * Order is chosen so that the first failure is the most informative one. If the buyer and
 * seller journey is broken, knowing that a filter is also wrong tells you nothing you can
 * act on; if the journey works and the filters do not, that is a precise result.
 *
 * The performance suite is last and is skipped rather than failed on a small database:
 * below its row threshold the planner is right to ignore every index, and asserting
 * otherwise would be asserting that PostgreSQL should make a worse choice.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ['the buyer and seller journey', 'acceptance.mjs'],
  ['filter and ordering semantics', 'acceptance-filters.mjs'],
  ['the public web app', 'acceptance-web.mjs'],
  ['the admin console', 'acceptance-admin.mjs'],
  ['background jobs', 'acceptance-jobs.mjs'],
  ['security probes', 'acceptance-security.mjs'],
  ['plans and latency', 'acceptance-performance.mjs'],
];

const results = [];

for (const [label, script] of SUITES) {
  console.log(`\n${'━'.repeat(64)}\n  ${label}\n${'━'.repeat(64)}`);

  const started = Date.now();
  const run = spawnSync(process.execPath, [join(here, script)], {
    stdio: 'inherit',
    env: process.env,
  });
  const seconds = Math.round((Date.now() - started) / 1000);

  results.push({ label, script, status: run.status ?? 1, seconds });
}

console.log(`\n${'═'.repeat(64)}\n  Summary\n${'═'.repeat(64)}`);

for (const result of results) {
  const mark = result.status === 0 ? '✓' : '✗';
  console.log(`  ${mark} ${result.label.padEnd(34)} ${String(result.seconds).padStart(4)}s`);
}

const failed = results.filter((result) => result.status !== 0);

if (failed.length === 0) {
  console.log('\nAll suites passed.');
} else {
  console.log(`\n${failed.length} suite(s) failed:`);
  for (const result of failed) console.log(`  - ${result.label}  (scripts/${result.script})`);
  console.log(
    '\nA suite that aborted with "fetch failed" usually means a service restarted mid-run\n' +
      'rather than a defect. Re-run it on its own before investigating.',
  );
  process.exitCode = 1;
}
