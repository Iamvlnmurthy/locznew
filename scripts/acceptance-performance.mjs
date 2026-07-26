#!/usr/bin/env node
/**
 * Performance gate.
 *
 *   npm run db:generate-load -w @locz/api -- 50000    # once, to make the numbers mean something
 *   LOCZ_PSQL=/path/to/psql node scripts/acceptance-performance.mjs
 *
 * Two things are checked, because a fast response can hide a bad plan and a good plan can
 * still be slow:
 *
 *   plans  — the query PostgreSQL actually ran used the index it was designed for, and did
 *            not fall back to reading the whole table
 *   time   — the endpoints a user waits on answer inside a budget
 *
 * The plan checks matter more than the timings. On a laptop with a warm cache almost
 * everything is fast; a sequential scan over fifty thousand rows still finishes in
 * milliseconds and then falls over at five hundred thousand. The plan is what tells you
 * which one you have.
 *
 * This suite is meaningless against a seeded-only database: with fifty listings the
 * planner correctly ignores every index, and asserting otherwise would be asserting that
 * PostgreSQL should make a worse choice. It refuses to run below a threshold rather than
 * reporting a green light nobody should trust.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API = process.env.LOCZ_API ?? 'http://127.0.0.1:4000/api/v1';
const PSQL = process.env.LOCZ_PSQL ?? 'psql';
const MIN_ROWS = Number(process.env.LOCZ_PERF_MIN_ROWS ?? 10_000);

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? `  ${detail}` : ''}`);
  }
}

function step(title) {
  console.log(`\n${title}`);
}

/** Credentials through the environment, never argv — a password in a process list is a leak. */
function psqlEnvironment() {
  const file = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const match = /^DATABASE_URL=(.+)$/m.exec(file);
  const raw = process.env.DATABASE_URL ?? match?.[1].trim().replace(/^"|"$/g, '');
  if (!raw) throw new Error('DATABASE_URL not found in the environment or .env');

  const url = new URL(raw);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
  };
}

function sql(statement) {
  return execFileSync(PSQL, ['-tAc', statement], {
    encoding: 'utf8',
    env: psqlEnvironment(),
    maxBuffer: 8 * 1024 * 1024,
  });
}

function explain(statement) {
  return sql(`EXPLAIN (ANALYZE, FORMAT TEXT) ${statement}`);
}

function executionMs(plan) {
  return Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? NaN);
}

/**
 * A sequential scan on the listings table is the thing to catch. On other tables it can be
 * correct — a scan of eight categories beats an index lookup — so this asks specifically
 * about the table that grows.
 */
function scansAllListings(plan) {
  return /Seq Scan on listings/.test(plan);
}

/** Median of repeated runs: one sample measures whatever the cache was doing. */
async function median(times, fn) {
  const samples = [];
  for (let index = 0; index < times; index += 1) samples.push(await fn());
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

async function timeEndpoint(path) {
  const started = performance.now();
  const response = await fetch(`${API}${path}`);
  await response.text();
  return { ms: performance.now() - started, status: response.status };
}

const POINT = "ST_SetSRID(ST_MakePoint(78.3885,17.4411),4326)::geography";

async function main() {
  console.log(`LocZ performance gate against ${API}`);

  // ---------------------------------------------------------------- 0. enough data
  step('0. Enough rows for the numbers to mean anything');
  const listingCount = Number(sql('SELECT COUNT(*) FROM listings').trim());
  console.log(`  ${listingCount.toLocaleString('en-IN')} listings`);

  if (listingCount < MIN_ROWS) {
    console.error(
      `\nOnly ${listingCount.toLocaleString('en-IN')} listings. Below ${MIN_ROWS.toLocaleString('en-IN')} the planner ` +
        'is right to ignore every index, so these assertions would be measuring nothing.\n' +
        'Generate a dataset first:\n\n  npm run db:generate-load -w @locz/api -- 50000\n',
    );
    process.exitCode = 1;
    return;
  }
  check('dataset is large enough to exercise the indexes', true, `${listingCount.toLocaleString('en-IN')} rows`);

  // ---------------------------------------------------------------- 1. plans
  step('1. The queries use the indexes they were designed for');

  const radiusPlan = explain(`
    SELECT id FROM listings
    WHERE geo IS NOT NULL AND status = 'PUBLISHED' AND "deletedAt" IS NULL AND visibility = 'PUBLIC'
      AND ST_DWithin(geo, ${POINT}, 10000)
    ORDER BY geo <-> ${POINT} LIMIT 24
  `);
  check(
    'radius search uses the spatial index',
    /listings_geo_published_gist_idx/.test(radiusPlan),
    `${executionMs(radiusPlan).toFixed(1)} ms`,
  );
  check('radius search does not read the whole table', !scansAllListings(radiusPlan));

  const cityPlan = explain(`
    SELECT id FROM listings
    WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL AND visibility = 'PUBLIC'
      AND "cityId" = (SELECT id FROM cities WHERE "isLaunched" = true LIMIT 1)
    ORDER BY "publishedAt" DESC LIMIT 24
  `);
  check(
    'city browse does not read the whole table',
    !scansAllListings(cityPlan),
    `${executionMs(cityPlan).toFixed(1)} ms`,
  );

  const pincodePlan = explain(`
    SELECT id FROM listings
    WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL AND "pincodeCode" = '500081'
    ORDER BY "publishedAt" DESC LIMIT 24
  `);
  check(
    'pincode browse does not read the whole table',
    !scansAllListings(pincodePlan),
    `${executionMs(pincodePlan).toFixed(1)} ms`,
  );

  const expiryPlan = explain(`
    SELECT id FROM listings
    WHERE status = 'PUBLISHED' AND "expiresAt" < NOW() LIMIT 100
  `);
  check(
    'the expiry sweeper does not read the whole table',
    !scansAllListings(expiryPlan),
    `${executionMs(expiryPlan).toFixed(1)} ms`,
  );

  // The slug is fetched first rather than sub-selected: a subquery over the same table
  // puts its own sequential scan in the plan text, and the check would then be reading
  // the scaffolding instead of the lookup.
  const sampleSlug = sql("SELECT slug FROM listings WHERE status = 'PUBLISHED' LIMIT 1").trim();
  const slugPlan = explain(`SELECT id FROM listings WHERE slug = '${sampleSlug}'`);
  check(
    'a listing is found by slug through its unique index',
    /Index Scan using listings_slug_key/.test(slugPlan),
    `${executionMs(slugPlan).toFixed(2)} ms`,
  );

  // ---------------------------------------------------------------- 2. the shape of the radius query
  step('2. How the radius search spends its time');

  const rowsInRadius = Number(
    sql(`SELECT COUNT(*) FROM listings WHERE geo IS NOT NULL AND status='PUBLISHED' AND ST_DWithin(geo, ${POINT}, 10000)`).trim(),
  );
  console.log(`  ${rowsInRadius.toLocaleString('en-IN')} listings within 10 km of that point`);

  // ST_DWithin's selectivity estimate on geography is famously poor, which pushes the
  // planner into a bitmap scan and a sort of everything in the radius. The nearest-
  // neighbour operator can instead walk the index in distance order and stop at the page
  // size — the difference is a constant against a number that grows with density.
  const knnPlan = explain(`
    SELECT id FROM listings
    WHERE geo IS NOT NULL AND status = 'PUBLISHED' AND "deletedAt" IS NULL AND visibility = 'PUBLIC'
    ORDER BY geo <-> ${POINT} LIMIT 24
  `);

  const radiusMs = executionMs(radiusPlan);
  const knnMs = executionMs(knnPlan);
  console.log(`  filter-then-sort: ${radiusMs.toFixed(1)} ms · index-ordered: ${knnMs.toFixed(1)} ms`);
  check(
    'the nearest-neighbour operator can drive the index',
    /Index Scan using listings_geo_published_gist_idx/.test(knnPlan),
    'so distance-ordered paging need not sort the whole radius',
  );

  // Recorded rather than asserted: this is a design observation for whoever owns the
  // query, not a pass or fail.
  if (Number.isFinite(radiusMs) && Number.isFinite(knnMs) && knnMs > 0) {
    console.log(`  → index-ordered is ${(radiusMs / knnMs).toFixed(1)}× faster at this density`);
  }

  // ---------------------------------------------------------------- 3. endpoints
  step('3. What a user actually waits for');

  const budgets = [
    ['home feed', '/feed?limit=12', 1500],
    ['city browse', '/listings?limit=24', 1000],
    ['pincode area', '/listings?pincode=500081&limit=24', 1500],
    ['pincode with a budget', '/listings?pincode=500081&priceMax=20000&limit=24', 1500],
    ['keyword search', '/search?q=fridge&limit=24', 1500],
    ['sorted by price', '/listings?sort=price_asc&limit=24', 1500],
    ['category listing', '/categories', 500],
    ['pincode lookup', '/locations/pincodes/500081', 500],
  ];

  for (const [label, path, budgetMs] of budgets) {
    const first = await timeEndpoint(path);
    if (first.status !== 200) {
      check(`${label} responds`, false, `HTTP ${first.status}`);
      continue;
    }

    const ms = await median(5, async () => (await timeEndpoint(path)).ms);
    check(`${label} answers within ${budgetMs} ms`, ms < budgetMs, `${ms.toFixed(0)} ms`);
  }

  // ---------------------------------------------------------------- 4. paging deep
  step('4. Deep pages do not fall off a cliff');

  const firstPage = await median(3, async () => (await timeEndpoint('/listings?limit=24&page=1')).ms);
  const deepPage = await median(3, async () => (await timeEndpoint('/listings?limit=24&page=50')).ms);
  console.log(`  page 1: ${firstPage.toFixed(0)} ms · page 50: ${deepPage.toFixed(0)} ms`);
  check(
    'page fifty is not dramatically worse than page one',
    deepPage < Math.max(firstPage * 4, 1500),
    `${(deepPage / firstPage).toFixed(1)}× slower`,
  );

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nPerformance run aborted: ${error.message}`);
  process.exitCode = 1;
});
