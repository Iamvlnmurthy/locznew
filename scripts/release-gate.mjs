#!/usr/bin/env node
/**
 * One evidence-producing entry point for the automated LocZ release gates.
 *
 * The JSON report contains command names, exit status and duration only. Child commands
 * inherit credentials from the environment, but their values are never copied into the
 * report or printed by this orchestrator.
 */

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const options = new Set(process.argv.slice(2));
const environmentArgument = process.argv.indexOf('--env');
const environmentFile =
  environmentArgument >= 0 && process.argv[environmentArgument + 1]
    ? process.argv[environmentArgument + 1]
    : 'infrastructure/docker/.env';
const bundledNpmCli = resolve(
  dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js',
);
const npmCli =
  process.env.npm_execpath ??
  (process.platform === 'win32' && existsSync(bundledNpmCli) ? bundledNpmCli : null);
const npm = npmCli ? process.execPath : 'npm';
const npmPrefix = npmCli ? [npmCli] : [];
const flutter = findExecutable('flutter');
const mobileRoot = resolve(root, 'apps', 'mobile');
const startedAt = new Date();
const evidenceArgument = process.argv.indexOf('--evidence');
const requestedEvidence =
  evidenceArgument >= 0 && process.argv[evidenceArgument + 1]
    ? process.argv[evidenceArgument + 1]
    : `artifacts/release-gate-${startedAt.toISOString().replaceAll(':', '-')}.json`;
const evidencePath = resolve(root, requestedEvidence);
let initialWorktreeState = null;

const evidence = {
  schemaVersion: 2,
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  candidate: gitValue(['rev-parse', 'HEAD']),
  branch: gitValue(['branch', '--show-current']),
  tag: gitValue(['describe', '--tags', '--exact-match']),
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  options: {
    allowDirty: options.has('--allow-dirty'),
    install: !options.has('--skip-install'),
    node: !options.has('--skip-node'),
    mobile: !options.has('--skip-mobile'),
    browser: !options.has('--skip-browser'),
    preflight: !options.has('--skip-preflight'),
    stack: options.has('--stack'),
    httpAcceptance: options.has('--stack') && !options.has('--skip-http'),
    safetyDevelopment: options.has('--safety-development'),
    syntheticSafety: options.has('--synthetic-safety'),
    dns: options.has('--dns'),
    smoke: options.has('--smoke'),
  },
  steps: [],
  result: 'running',
};

function gitValue(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function findExecutable(name) {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(command, [name], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  const candidates = result.stdout.split(/\r?\n/).filter(Boolean);
  if (process.platform === 'win32') {
    return (
      candidates.find((candidate) => /\.(?:bat|cmd|exe)$/i.test(candidate)) ?? candidates[0] ?? null
    );
  }
  return candidates[0] ?? null;
}

function recordStep(name, command, args, status, durationMs, error = null) {
  const step = {
    name,
    command: [command, ...args].join(' '),
    status,
    durationMs,
  };
  if (error) step.error = error;
  evidence.steps.push(step);
  console.log(`\n${status === 0 ? 'PASS' : 'FAIL'} ${name} (${durationMs} ms)`);
}

/**
 * A stage that was not run, recorded as such.
 *
 * It does not count as a failure — the gate is usable on a build machine with no database
 * — but it must not read as PASS either. A report that cannot distinguish "we checked and
 * it was fine" from "we did not check" is the kind of evidence that gets quoted in a
 * post-mortem.
 */
function recordSkip(name, command, note) {
  evidence.steps.push({ name, command, status: 0, durationMs: 0, skipped: true, note });
  console.log(`
SKIP ${name} — ${note}`);
}

/**
 * Runs a step against a throwaway checkout of the candidate commit.
 *
 * `npm ci` deletes `node_modules` and rebuilds it. Run in the live workspace — which is what
 * this gate used to do — that is destructive in two ways on Windows. It removes the generated
 * Prisma client, so typecheck, lint and six test suites start failing with
 * `Cannot find module '.prisma/client/default'`, which reads as a code defect rather than a
 * missing build step. And the API, web and admin servers hold native modules open, so the
 * delete half-succeeds and leaves a `node_modules` that is neither the old tree nor the new
 * one. Both happened here, an hour apart, and cost more time to diagnose than the install
 * saved by being convenient.
 *
 * A `git worktree` at the candidate commit gives a clean tree containing exactly the tracked
 * files, with no `node_modules` to fight over and nothing shared with the running stack. It
 * also makes the check stricter than it was: the install is verified against what is
 * *committed*, so an uncommitted file that the workspace happens to have cannot make a broken
 * lockfile look fine.
 *
 * The checkout is removed afterwards. `--keep-candidate` leaves it in place, because when an
 * install genuinely fails the tree is the evidence.
 */
function inCandidateCheckout(steps) {
  const commit = evidence.candidate ?? 'HEAD';
  const directory = mkdtempSync(join(tmpdir(), 'locz-release-candidate-'));

  // mkdtemp created it, and `git worktree add` insists on making the directory itself.
  const target = join(directory, 'candidate');
  const added = spawnSync('git', ['worktree', 'add', '--detach', target, commit], {
    cwd: root,
    encoding: 'utf8',
  });

  if (added.status !== 0) {
    console.log(`\n${'='.repeat(72)}\nisolated candidate checkout\n${'='.repeat(72)}`);
    console.log(added.stderr ?? added.stdout ?? '');
    recordStep(
      'isolated candidate checkout',
      'git',
      ['worktree', 'add', '--detach', '<temp>', commit],
      added.status ?? 1,
      0,
      'Could not create an isolated checkout of the candidate commit',
    );
    return;
  }

  console.log(`\nCandidate checked out in isolation at ${target}`);

  try {
    steps(target);
  } finally {
    if (options.has('--keep-candidate')) {
      console.log(`\nLeaving the candidate checkout in place: ${target}`);
    } else {
      spawnSync('git', ['worktree', 'remove', '--force', target], { cwd: root });
    }
  }
}

function run(name, command, args, cwd = root, env = process.env) {
  console.log(`\n${'='.repeat(72)}\n${name}\n${'='.repeat(72)}`);
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  const durationMs = Math.round(performance.now() - started);
  const status = result.status ?? 1;
  recordStep(
    name,
    command,
    args,
    status,
    durationMs,
    result.error instanceof Error ? result.error.message : null,
  );
}

function runFlutter(name, args) {
  if (!flutter) {
    recordStep(name, 'flutter', args, 1, 0, 'Flutter executable was not found');
    return;
  }
  if (process.platform === 'win32') {
    run(name, process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'call', flutter, ...args], mobileRoot);
    return;
  }
  run(name, flutter, args, mobileRoot);
}

function checkWorktree() {
  const started = performance.now();
  const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  const dirty = Boolean(result.stdout.trim());
  initialWorktreeState = result.stdout;
  const allowed = options.has('--allow-dirty');
  const status = result.status === 0 && (!dirty || allowed) ? 0 : 1;
  if (dirty) {
    console.log(
      allowed
        ? 'WARN Worktree contains changes; accepted only because --allow-dirty was supplied.'
        : 'FAIL Worktree contains changes. Cut the release candidate from a clean checkout.',
    );
  } else {
    console.log('PASS Worktree is clean.');
  }
  recordStep(
    'immutable candidate',
    'git',
    ['status', '--porcelain', '--untracked-files=all'],
    status,
    Math.round(performance.now() - started),
    result.error instanceof Error ? result.error.message : null,
  );
}

function checkCandidateStability() {
  const started = performance.now();
  const currentCandidate = gitValue(['rev-parse', 'HEAD']);
  const worktree = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  const sameCommit = currentCandidate === evidence.candidate;
  const sameWorktree = worktree.status === 0 && worktree.stdout === initialWorktreeState;
  const status = sameCommit && sameWorktree ? 0 : 1;
  if (status === 0) {
    console.log('PASS Candidate commit and worktree stayed unchanged throughout the gate.');
  } else {
    console.log(
      'FAIL Candidate changed while the gate was running; discard this evidence and rerun.',
    );
  }
  recordStep(
    'candidate stability',
    'git',
    ['rev-parse', 'HEAD', '&&', 'git', 'status', '--porcelain', '--untracked-files=all'],
    status,
    Math.round(performance.now() - started),
    worktree.error instanceof Error ? worktree.error.message : null,
  );
}

console.log(`LocZ release gate — ${evidence.candidate ?? 'unknown candidate'}`);
console.log(`Evidence: ${evidencePath}`);

checkWorktree();
if (environmentArgument >= 0 && !process.argv[environmentArgument + 1]) {
  recordStep(
    'release option safety',
    'gate:release',
    ['--env'],
    1,
    0,
    '--env requires a file path',
  );
}
if (
  options.has('--smoke') &&
  (options.has('--safety-development') || options.has('--synthetic-safety'))
) {
  recordStep(
    'release option safety',
    'gate:release',
    ['--smoke', '--safety-development/--synthetic-safety'],
    1,
    0,
    'Development or synthetic safety modes cannot be used for deployed smoke sign-off',
  );
}
if (
  (options.has('--synthetic-safety') || options.has('--safety-development')) &&
  !options.has('--stack')
) {
  recordStep(
    'release option safety',
    'gate:release',
    ['--safety-development/--synthetic-safety'],
    1,
    0,
    'Safety rehearsal options require --stack',
  );
}
run('patch integrity', 'git', ['diff', '--check']);
if (!options.has('--skip-node')) {
  const auditArguments = [...npmPrefix, 'audit', '--omit=dev', '--audit-level=high'];

  if (options.has('--skip-install')) {
    run('production dependency audit', npm, auditArguments);
  } else {
    inCandidateCheckout((candidate) => {
      run('reproducible install', npm, [...npmPrefix, 'ci'], candidate);
      // Audited where the install happened, so the answer describes the tree the lockfile
      // actually produces rather than whatever this workspace has accumulated.
      run('production dependency audit', npm, auditArguments, candidate);
    });
  }
  run('workspace typecheck', npm, [...npmPrefix, 'run', 'typecheck']);
  // Needs no running stack, so it belongs in the default path rather than behind --stack.
  run('translation coverage', npm, [...npmPrefix, 'run', 'check:i18n']);
  run('automated tests', npm, [...npmPrefix, 'test']);
  run('production builds', npm, [...npmPrefix, 'run', 'build']);
}
if (!options.has('--skip-mobile')) {
  runFlutter('Flutter analysis', ['analyze']);
  runFlutter('Flutter tests', ['test']);
}
if (!options.has('--skip-browser')) {
  run('browser interaction and accessibility gate', npm, [
    ...npmPrefix,
    'run',
    'acceptance:browser',
  ]);
  // The localized journey is a separate gate because it asserts something the English run
  // cannot: that Telugu and Hindi survive contact with a real browser — translated chrome,
  // no horizontal overflow at 430px, and WCAG contrast on text that is not English.
  //
  // It existed as an npm script that nothing invoked, which is the same as not having it:
  // the first time it was run against a candidate the whole suite reported green, it found
  // a real colour-contrast failure in the Hindi enquiry composer.
  run('localized browser journey', npm, [...npmPrefix, 'run', 'acceptance:localized-browser']);
  // Search is the one surface where the API can be right and the page still wrong, because
  // result counts, singular copy and the empty state are all rendered rather than returned.
  // Added here rather than left as an npm script: two earlier gates sat unreferenced in
  // package.json, and an unreferenced gate is one nobody runs until it has already rotted.
  run('search browser journey', npm, [...npmPrefix, 'run', 'acceptance:search-browser']);
}
if (!options.has('--skip-preflight')) {
  run('production configuration preflight', npm, [
    ...npmPrefix,
    'run',
    'preflight:production',
    '--',
    '--env',
    environmentFile,
    ...(options.has('--dns') ? ['--dns'] : []),
  ]);
}
// The HTTP suites need a live stack, so they are opt-in — but a release decided without
// them has not consulted the security probes, the filter semantics, the background jobs or
// the index plans. Roughly four hundred assertions that only a running system can answer.
// `--stack` should be used for any release that matters; the report records whether it was.
if (options.has('--stack')) {
  run('child-safety readiness', npm, [
    ...npmPrefix,
    'run',
    'verify:safety-readiness',
    '--',
    '--env',
    environmentFile,
    ...(options.has('--safety-development') ? ['--development'] : []),
  ]);
  if (options.has('--synthetic-safety')) {
    run(
      'restricted safety workflow',
      npm,
      [...npmPrefix, 'run', 'verify:safety', '--', '--env', environmentFile],
      root,
      { ...process.env, ALLOW_SYNTHETIC_SAFETY_VERIFICATION: '1' },
    );
  } else {
    recordSkip(
      'restricted safety workflow',
      'npm run verify:safety',
      'pass --synthetic-safety to authorize reversible local fixture creation',
    );
  }
  if (options.has('--skip-http')) {
    recordSkip(
      'http acceptance suites',
      'npm run acceptance:all',
      '--skip-http was supplied for a diagnostic run',
    );
  } else {
    run('http acceptance suites', npm, [...npmPrefix, 'run', 'acceptance:all']);
  }
} else {
  recordSkip(
    'child-safety readiness',
    'npm run verify:safety-readiness',
    'pass --stack to verify policy, provider and restricted officer continuity',
  );
  recordSkip(
    'restricted safety workflow',
    'npm run verify:safety',
    'pass --stack --synthetic-safety on a local non-production stack',
  );
  recordSkip(
    'http acceptance suites',
    'npm run acceptance:all',
    'pass --stack to run them against a live stack',
  );
}

if (options.has('--smoke')) {
  run('deployed production smoke', npm, [...npmPrefix, 'run', 'smoke:production']);
}
checkCandidateStability();

evidence.finishedAt = new Date().toISOString();
evidence.result = evidence.steps.every((step) => step.status === 0) ? 'pass' : 'fail';
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});

const failed = evidence.steps.filter((step) => step.status !== 0);
const skipped = evidence.steps.filter((step) => step.skipped);
const ran = evidence.steps.length - skipped.length;

console.log(`
${'='.repeat(72)}`);
// Skipped stages are counted apart from passing ones: "8/8 passed" when one of them was
// never run is the sentence someone quotes in a post-mortem.
console.log(
  `${evidence.result.toUpperCase()} — ${ran - failed.length}/${ran} gates passed` +
    (skipped.length ? `, ${skipped.length} skipped` : ''),
);
if (skipped.length) {
  console.log(`Not run: ${skipped.map((step) => step.name).join(', ')}`);
}
console.log(`Evidence written to ${evidencePath}`);
if (failed.length) {
  console.log(`Failed: ${failed.map((step) => step.name).join(', ')}`);
  process.exitCode = 1;
}
