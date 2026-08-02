#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const envArgument = process.argv.indexOf('--env');
const envPath = resolve(
  root,
  envArgument >= 0 && process.argv[envArgument + 1]
    ? process.argv[envArgument + 1]
    : 'infrastructure/docker/.env',
);
const shouldCheckDns = process.argv.includes('--dns');

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

function parseEnv(source) {
  const values = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value.replaceAll('\\n', '\n'));
  }
  return values;
}

function isPlaceholder(value) {
  return (
    !value ||
    /change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example|dev[-_ ]?secret|minioadmin/i.test(value)
  );
}

function required(env, key) {
  const value = env.get(key);
  if (isPlaceholder(value)) {
    fail(`${key} is missing or still uses a placeholder`);
    return '';
  }
  pass(`${key} is configured`);
  return value;
}

function productionUrl(env, key, { allowInternal = false } = {}) {
  const value = required(env, key);
  if (!value) return;
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${key} must be an absolute URL`);
    return;
  }
  const local = ['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2'].includes(url.hostname);
  if (local) fail(`${key} still points at a local development address`);
  if (!allowInternal && url.protocol !== 'https:') {
    fail(`${key} must use HTTPS in production`);
  }
}

const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
  encoding: 'utf8',
});
if (docker.status === 0 && docker.stdout.trim()) {
  pass('Docker engine is reachable');
} else {
  fail('Docker engine is not installed or not reachable');
}

const nextDockerfile = readFileSync(resolve(root, 'infrastructure/docker/Dockerfile.next'), 'utf8');
for (const app of ['web', 'admin']) {
  const manifest = JSON.parse(readFileSync(resolve(root, `apps/${app}/package.json`), 'utf8'));
  const workspaceDependencies = Object.keys(manifest.dependencies ?? {}).filter((name) =>
    name.startsWith('@locz/'),
  );
  for (const dependency of workspaceDependencies) {
    const packageDirectory = dependency.slice('@locz/'.length);
    const copyInstruction = `COPY packages/${packageDirectory}/package.json`;
    if (nextDockerfile.includes(copyInstruction)) {
      pass(`Next image includes ${dependency} for ${app}`);
    } else {
      fail(`Dockerfile.next omits ${dependency}, required by ${app}`);
    }
  }
}

const certificateFiles = [
  'infrastructure/docker/certbot/conf/live/locz.in/fullchain.pem',
  'infrastructure/docker/certbot/conf/live/locz.in/privkey.pem',
];
for (const certificate of certificateFiles) {
  if (existsSync(resolve(root, certificate))) {
    pass(`${certificate} exists`);
  } else {
    fail(`${certificate} is missing; complete the TLS bootstrap before starting Nginx`);
  }
}

if (!existsSync(envPath)) {
  fail(
    `${envPath.slice(root.length + 1)} is missing; production Compose does not read the root .env`,
  );
} else {
  const env = parseEnv(readFileSync(envPath, 'utf8'));
  if (env.get('NODE_ENV') === 'production') {
    pass('NODE_ENV is production');
  } else {
    fail('NODE_ENV must be production');
  }

  required(env, 'DATABASE_URL');
  required(env, 'POSTGRES_USER');
  required(env, 'POSTGRES_PASSWORD');
  required(env, 'POSTGRES_DB');
  required(env, 'REDIS_PASSWORD');
  required(env, 'MEILI_MASTER_KEY');

  const accessSecret = required(env, 'JWT_ACCESS_SECRET');
  const refreshSecret = required(env, 'JWT_REFRESH_SECRET');
  if (accessSecret && accessSecret.length < 32)
    fail('JWT_ACCESS_SECRET must be at least 32 characters');
  if (refreshSecret && refreshSecret.length < 32) {
    fail('JWT_REFRESH_SECRET must be at least 32 characters');
  }
  if (accessSecret && refreshSecret && accessSecret === refreshSecret) {
    fail('JWT access and refresh secrets must be different');
  }

  // Sign-in is a mobile number and a password. The one-time-code routes are switched off
  // with AUTH_OTP_ENABLED=false and answer as though they do not exist, so the product sends
  // no SMS at all — and demanding gateway credentials for a feature that is turned off is a
  // gate that blocks a launch without protecting anything.
  //
  // The check is not removed, it is made conditional. The moment somebody turns the code
  // routes back on, every requirement below applies again, and the mock provider is refused
  // as firmly as before. That ordering matters: enabling OTP without a real gateway would
  // mean the server handing out login codes in its own responses.
  const otpEnabled = (env.get('AUTH_OTP_ENABLED') ?? 'true') !== 'false';
  const otpProvider = otpEnabled ? required(env, 'OTP_PROVIDER') : env.get('OTP_PROVIDER');

  if (!otpEnabled) {
    warn(
      'AUTH_OTP_ENABLED=false — sign-in is password-only, so no SMS gateway is required. ' +
        'Turning the code routes back on will require MSG91 or Twilio credentials again.',
    );
  } else if (otpProvider === 'mock') {
    fail('OTP_PROVIDER=mock is forbidden in production');
  } else if (otpProvider === 'pin') {
    fail('OTP_PROVIDER=pin is a shared code and is forbidden in production');
  } else if (otpProvider === 'msg91') {
    required(env, 'MSG91_AUTH_KEY');
    required(env, 'MSG91_SENDER_ID');
    required(env, 'MSG91_TEMPLATE_ID');
  } else if (otpProvider === 'twilio') {
    required(env, 'TWILIO_ACCOUNT_SID');
    required(env, 'TWILIO_FROM_NUMBER');
    const hasApiKey =
      !isPlaceholder(env.get('TWILIO_API_KEY_SID')) &&
      !isPlaceholder(env.get('TWILIO_API_KEY_SECRET'));
    const hasAuthToken = !isPlaceholder(env.get('TWILIO_AUTH_TOKEN'));
    if (!hasApiKey && !hasAuthToken) {
      fail(
        'Twilio requires TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (preferred), or TWILIO_AUTH_TOKEN',
      );
    }
  } else if (otpEnabled && otpProvider) {
    fail('OTP_PROVIDER must be msg91 or twilio');
  }

  productionUrl(env, 'API_BASE_URL');
  productionUrl(env, 'NEXT_PUBLIC_API_BASE_URL');
  productionUrl(env, 'NEXT_PUBLIC_ADMIN_API_BASE_URL');
  productionUrl(env, 'NEXT_PUBLIC_SITE_URL');
  productionUrl(env, 'STORAGE_ENDPOINT');
  productionUrl(env, 'STORAGE_PUBLIC_BASE_URL');
  productionUrl(env, 'MEILI_HOST', { allowInternal: true });
  required(env, 'STORAGE_BUCKET');
  required(env, 'STORAGE_ACCESS_KEY_ID');
  required(env, 'STORAGE_SECRET_ACCESS_KEY');

  const imageScanner = required(env, 'IMAGE_SCANNER_PROVIDER');
  if (imageScanner === 'quarantine') {
    fail('IMAGE_SCANNER_PROVIDER=quarantine is a safe local fallback, not a production classifier');
  } else if (imageScanner === 'nsfwjs') {
    // Nothing to configure and nothing to reach: the model ships in node_modules and runs
    // in-process. Only the thresholds can be got wrong.
    const explicit = Number(env.get('NSFWJS_EXPLICIT_REVIEW_SCORE') ?? 0.5);
    const suggestive = Number(env.get('NSFWJS_SUGGESTIVE_REVIEW_SCORE') ?? 0.9);
    if (
      ![explicit, suggestive].every(Number.isFinite) ||
      explicit <= 0 ||
      explicit > 1 ||
      suggestive <= 0 ||
      suggestive > 1
    ) {
      fail('nsfwjs review scores must be numbers in (0, 1]');
    } else {
      pass('nsfwjs runs in-process with review scores in range');
    }
  } else if (imageScanner === 'rekognition') {
    required(env, 'AWS_REKOGNITION_REGION');
    const hasAccessKey = !isPlaceholder(env.get('AWS_REKOGNITION_ACCESS_KEY_ID'));
    const hasSecret = !isPlaceholder(env.get('AWS_REKOGNITION_SECRET_ACCESS_KEY'));
    if (hasAccessKey !== hasSecret) {
      fail('AWS Rekognition credentials are partial; configure both or neither');
    } else if (!hasAccessKey) {
      warn(
        'AWS Rekognition static credentials are absent; verify the API workload has a restricted IAM role',
      );
    } else {
      pass('AWS Rekognition credentials are configured');
    }

    const scannerMin = Number(env.get('AWS_REKOGNITION_MIN_CONFIDENCE') ?? 50);
    const scannerReview = Number(env.get('AWS_REKOGNITION_REVIEW_CONFIDENCE') ?? 60);
    const scannerReject = Number(env.get('AWS_REKOGNITION_REJECT_CONFIDENCE') ?? 90);
    if (
      ![scannerMin, scannerReview, scannerReject].every(Number.isFinite) ||
      scannerMin < 50 ||
      scannerMin > scannerReview ||
      scannerReview > scannerReject ||
      scannerReject > 100
    ) {
      fail(
        'AWS Rekognition thresholds must be numbers satisfying 50 <= min <= review <= reject <= 100',
      );
    } else {
      pass('AWS Rekognition confidence thresholds are ordered safely');
    }
  } else if (imageScanner) {
    fail('IMAGE_SCANNER_PROVIDER must be nsfwjs or rekognition for this production candidate');
  }

  const protectedHashProvider = required(env, 'PROTECTED_HASH_PROVIDER');
  if (protectedHashProvider === 'unconfigured') {
    fail(
      'PROTECTED_HASH_PROVIDER is not configured; complete vetted PhotoDNA/Thorn onboarding before launch',
    );
  } else if (protectedHashProvider) {
    fail(
      `PROTECTED_HASH_PROVIDER=${protectedHashProvider} is not supported by this build; add and test the vetted adapter before selecting it`,
    );
  }

  const origins = required(env, 'CORS_ORIGINS');
  for (const origin of ['https://locz.in', 'https://admin.locz.in']) {
    if (
      origins &&
      !origins
        .split(',')
        .map((item) => item.trim())
        .includes(origin)
    ) {
      fail(`CORS_ORIGINS must include ${origin}`);
    }
  }

  const fcm = ['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY'];
  const configuredFcm = fcm.filter((key) => !isPlaceholder(env.get(key)));
  if (configuredFcm.length === 0) {
    warn('FCM is not configured; production push notifications will be unavailable');
  } else if (configuredFcm.length !== fcm.length) {
    fail('FCM configuration is partial; set all three FCM variables or none');
  } else {
    pass('FCM server credentials are configured');
  }

  if (isPlaceholder(env.get('SENTRY_DSN'))) {
    warn('SENTRY_DSN is not configured; production exceptions will lack remote reporting');
  }
  if (isPlaceholder(env.get('SMTP_HOST')) || isPlaceholder(env.get('MAIL_FROM'))) {
    warn('SMTP is not fully configured; operational email will be unavailable');
  }
}

if (shouldCheckDns) {
  for (const hostname of ['locz.in', 'www.locz.in', 'admin.locz.in']) {
    try {
      await lookup(hostname);
      pass(`DNS resolves for ${hostname}`);
    } catch {
      fail(`DNS does not resolve for ${hostname}`);
    }
  }
} else {
  warn('DNS was not checked; rerun with --dns on the production host');
}

console.log('LocZ production preflight');
for (const message of passes) console.log(`  PASS  ${message}`);
for (const message of warnings) console.log(`  WARN  ${message}`);
for (const message of failures) console.log(`  FAIL  ${message}`);
console.log(`\n${passes.length} passed, ${warnings.length} warnings, ${failures.length} failures`);

process.exitCode = failures.length > 0 ? 1 : 0;
