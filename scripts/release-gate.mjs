#!/usr/bin/env node
/**
 * One evidence-producing entry point for the automated LocZ release gates.
 *
 * The JSON report contains command names, exit status and duration only. Child commands
 * inherit credentials from the environment, but their values are never copied into the
 * report or printed by this orchestrator.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const options = new Set(process.argv.slice(2));
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
  schemaVersion: 1,
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

function run(name, command, args, cwd = root) {
  console.log(`\n${'='.repeat(72)}\n${name}\n${'='.repeat(72)}`);
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
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
run('patch integrity', 'git', ['diff', '--check']);
if (!options.has('--skip-node')) {
  if (!options.has('--skip-install')) run('reproducible install', npm, [...npmPrefix, 'ci']);
  run('production dependency audit', npm, [
    ...npmPrefix,
    'audit',
    '--omit=dev',
    '--audit-level=high',
  ]);
  run('workspace typecheck', npm, [...npmPrefix, 'run', 'typecheck']);
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
}
if (!options.has('--skip-preflight')) {
  run('production configuration preflight', npm, [
    ...npmPrefix,
    'run',
    'preflight:production',
    ...(options.has('--dns') ? ['--', '--dns'] : []),
  ]);
}
// The HTTP suites need a live stack, so they are opt-in — but a release decided without
// them has not consulted the security probes, the filter semantics, the background jobs or
// the index plans. Roughly four hundred assertions that only a running system can answer.
// `--stack` should be used for any release that matters; the report records whether it was.
if (options.has('--stack')) {
  run('http acceptance suites', npm, [...npmPrefix, 'run', 'acceptance:all']);
} else {
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
