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

/**
 * One retry, and only for the one cause worth retrying.
 *
 * A suite that dies with "fetch failed" has almost always met a neighbouring dev server
 * mid-restart, triggered by somebody editing a page while this runs. That is not a defect,
 * and reporting it as one teaches people to disbelieve the gate — which costs more than
 * the noise saves.
 *
 * A retry is not a pass, though. The summary says which suites needed one, because a suite
 * that needs a retry every time is saying something about the environment that a silent
 * second attempt would bury.
 */
function runSuite(script) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [join(here, script)], {
    encoding: 'utf8',
    env: process.env,
  });

  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');

  return {
    status: run.status ?? 1,
    seconds: Math.round((Date.now() - started) / 1000),
    transient: /fetch failed|ECONNREFUSED|socket hang up/i.test(
      `${run.stdout ?? ''}${run.stderr ?? ''}`,
    ),
  };
}

for (const [label, script] of SUITES) {
  console.log(`\n${'\u2501'.repeat(64)}\n  ${label}\n${'\u2501'.repeat(64)}`);

  let attempt = runSuite(script);
  let retried = false;

  if (attempt.status !== 0 && attempt.transient) {
    console.log('\n  A service restarted mid-run. Trying once more...\n');
    retried = true;
    attempt = runSuite(script);
  }

  results.push({ label, script, status: attempt.status, seconds: attempt.seconds, retried });
}

console.log(`\n${'═'.repeat(64)}\n  Summary\n${'═'.repeat(64)}`);

for (const result of results) {
  const mark = result.status === 0 ? '✓' : '✗';
  const note = result.retried ? '  (passed on retry after a restart)' : '';
  console.log(`  ${mark} ${result.label.padEnd(34)} ${String(result.seconds).padStart(4)}s${note}`);
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
