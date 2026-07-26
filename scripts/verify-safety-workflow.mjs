#!/usr/bin/env node

/**
 * Reversible verification of the restricted child-safety workflow.
 *
 * This never pretends a protected-hash provider returned a match. It labels the case as
 * synthetic, uses an existing harmless archived seed image, exercises the live API, and
 * restores every touched row in a finally block.
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..');
const envArgument = process.argv.indexOf('--env');
const envPath = resolve(
  root,
  envArgument >= 0 && process.argv[envArgument + 1] ? process.argv[envArgument + 1] : '.env',
);
dotenv.config({ path: envPath, quiet: true });

const { Client } = pg;
const apiBase =
  process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000/api/v1';
const databaseUrl = new URL(process.env.DATABASE_URL);
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

if (process.env.ALLOW_SYNTHETIC_SAFETY_VERIFICATION !== '1') {
  throw new Error(
    'Refusing to create a synthetic case. Set ALLOW_SYNTHETIC_SAFETY_VERIFICATION=1 explicitly.',
  );
}
if (process.env.NODE_ENV === 'production' || !localHosts.has(databaseUrl.hostname)) {
  throw new Error(
    'Synthetic safety verification is restricted to a local non-production database.',
  );
}

const db = new Client({ connectionString: process.env.DATABASE_URL });
const createdCaseIds = [];
const verificationDeviceKey = `safety-verification-${randomUUID()}`;
let media;

async function api(path, token, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} -> ${response.status}: ${
        body?.error?.message ?? JSON.stringify(body)
      }`,
    );
  }
  return body.data ?? body;
}

async function createCase() {
  const caseId = randomUUID();
  await db.query('begin');
  try {
    await db.query(
      `update listing_media
       set status = 'LEGAL_HOLD', "failureReason" = $2
       where id = $1`,
      [media.id, 'Synthetic verification hold — harmless seeded image'],
    );
    await db.query(
      `insert into media_safety_cases
         (id, "mediaId", status, provider, "providerReference", "reasonCode", "openedAt", "updatedAt")
       values ($1, $2, 'OPEN', $3, $4, $5, now(), now())`,
      [
        caseId,
        media.id,
        'synthetic-local-verification',
        `SAFE-${caseId}`,
        'SYNTHETIC_VERIFICATION',
      ],
    );
    await db.query('commit');
    createdCaseIds.push(caseId);
    return caseId;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

async function removeCase(caseId) {
  await db.query('begin');
  try {
    await db.query('delete from media_safety_access_logs where "caseId" = $1', [caseId]);
    await db.query('delete from media_safety_cases where id = $1', [caseId]);
    await db.query(
      `update listing_media
       set status = $2::"MediaStatus", "failureReason" = $3
       where id = $1`,
      [media.id, media.mediaStatus, media.failureReason],
    );
    await db.query('commit');
    createdCaseIds.splice(createdCaseIds.indexOf(caseId), 1);
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await db.connect();
  const picked = await db.query(
    `select m.id, m.status::text as "mediaStatus", m."failureReason"
     from listing_media m
     join listings l on l.id = m."listingId"
     where l.status = 'ARCHIVED'
       and not exists (
         select 1 from media_safety_cases c where c."mediaId" = m.id
       )
     order by m."createdAt" asc
     limit 1`,
  );
  assert(
    picked.rows[0],
    'No harmless archived seed media is available for reversible verification.',
  );
  media = picked.rows[0];

  const login = await api('/auth/login/email', null, {
    method: 'POST',
    body: JSON.stringify({
      email: process.env.SAFETY_TEST_EMAIL ?? 'childsafety@locz.test',
      password: process.env.SAFETY_TEST_PASSWORD ?? 'LocZ@dev1234',
      device: {
        deviceKey: verificationDeviceKey,
        platform: 'WEB',
        name: 'Safety workflow verification',
      },
    }),
  });
  const token = login.tokens.accessToken;

  const closeCaseId = await createCase();
  const queue = await api('/moderation/safety/cases', token);
  assert(
    queue.some((item) => item.id === closeCaseId && item.reasonCode === 'SYNTHETIC_VERIFICATION'),
    'Synthetic open case did not appear in the officer queue.',
  );

  const detail = await api(`/moderation/safety/cases/${closeCaseId}`, token);
  const serializedDetail = JSON.stringify(detail);
  for (const forbidden of ['storageKey', 'sha256', 'perceptualHash', '"url"']) {
    assert(
      !serializedDetail.includes(forbidden),
      `Case detail leaked forbidden field ${forbidden}.`,
    );
  }

  const preview = await api(`/moderation/safety/cases/${closeCaseId}/evidence-preview`, token, {
    method: 'POST',
    body: JSON.stringify({
      justification: 'Synthetic local verification of audited evidence signing',
    }),
  });
  assert(
    preview.url && preview.expiresInSeconds > 0,
    'Evidence preview was not signed and bounded.',
  );

  await api(`/moderation/safety/cases/${closeCaseId}/report`, token, {
    method: 'POST',
    body: JSON.stringify({
      reportReference: `SYNTHETIC-${closeCaseId}`,
      justification: 'Synthetic local verification; no external report was made',
    }),
  });
  await api(`/moderation/safety/cases/${closeCaseId}/close`, token, {
    method: 'POST',
    body: JSON.stringify({
      justification: 'Synthetic local verification completed; no illegal content involved',
    }),
  });
  const closed = await db.query(
    `select c.status, m.status as "mediaStatus", count(a.id)::int as "auditCount"
     from media_safety_cases c
     join listing_media m on m.id = c."mediaId"
     left join media_safety_access_logs a on a."caseId" = c.id
     where c.id = $1
     group by c.status, m.status`,
    [closeCaseId],
  );
  assert(
    closed.rows[0]?.status === 'CLOSED' &&
      closed.rows[0]?.mediaStatus === 'LEGAL_HOLD' &&
      closed.rows[0]?.auditCount >= 4,
    `Close invariant failed: ${JSON.stringify(closed.rows[0])}`,
  );
  await removeCase(closeCaseId);

  const releaseCaseId = await createCase();
  await api(`/moderation/safety/cases/${releaseCaseId}/release`, token, {
    method: 'POST',
    body: JSON.stringify({
      justification: 'Synthetic harmless seed image confirmed as verification-only false positive',
    }),
  });
  const released = await db.query(
    `select c.status, m.status as "mediaStatus", count(a.id)::int as "auditCount"
     from media_safety_cases c
     join listing_media m on m.id = c."mediaId"
     left join media_safety_access_logs a on a."caseId" = c.id
     where c.id = $1
     group by c.status, m.status`,
    [releaseCaseId],
  );
  assert(
    released.rows[0]?.status === 'RELEASED' &&
      released.rows[0]?.mediaStatus === 'REVIEW_REQUIRED' &&
      released.rows[0]?.auditCount >= 1,
    `Release invariant failed: ${JSON.stringify(released.rows[0])}`,
  );
  await removeCase(releaseCaseId);

  const remaining = await db.query(
    `select count(*)::int as count
     from media_safety_cases
     where provider = 'synthetic-local-verification'`,
  );
  assert(remaining.rows[0].count === 0, 'Synthetic cases remained after verification cleanup.');

  console.log(
    JSON.stringify(
      {
        authentication: 'passed',
        queue: 'passed',
        metadataRedaction: 'passed',
        evidenceSigningAndAudit: 'passed',
        reportThenClose: closed.rows[0],
        release: released.rows[0],
        cleanupRemainingSyntheticCases: remaining.rows[0].count,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  for (const caseId of [...createdCaseIds]) {
    try {
      await removeCase(caseId);
    } catch (error) {
      console.error(
        `Cleanup failed for ${caseId}: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }
  }
  try {
    // Sessions cascade from the temporary device, returning authentication state to its
    // pre-verification shape as well as restoring the case and media rows.
    await db.query('delete from devices where "deviceKey" = $1', [verificationDeviceKey]);
  } catch (error) {
    console.error(
      `Authentication cleanup failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
  try {
    await db.end();
  } catch {
    // The primary error is more useful than a second close error.
  }
}
