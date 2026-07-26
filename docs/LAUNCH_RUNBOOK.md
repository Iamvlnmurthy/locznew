# Launch runbook

This is the go/no-go sheet for LocZ. `DEPLOYMENT.md` explains how the stack is
deployed; this document names the evidence, people and decisions required to launch it.
No checkbox is satisfied by “the command should work”.

## Release record

Create one record for every candidate and keep it with the release:

| Field          | Required value                                                   |
| -------------- | ---------------------------------------------------------------- |
| Release owner  | Named person with authority to call go/no-go                     |
| Incident lead  | Named person who is not also performing the deployment           |
| Candidate      | Immutable Git commit and annotated tag                           |
| Images         | Registry, tag and digest for API, worker, web and admin          |
| Database       | Backup object/version and successful restore-drill reference     |
| Mobile         | Android version code/AAB hash and iOS build number/archive hash  |
| Window         | Start, expected completion and rollback decision deadline in IST |
| Change summary | User-visible changes, migrations, flags and known limitations    |

Do not launch from an uncommitted worktree or mutable image tag. Record the previous
known-good image digests before deployment.

### Current engineering candidate

Candidate `f336579712984b40293fd5947069313d6b64ec15` is the latest locally verified
engineering checkpoint. This is evidence of code readiness, not a production GO decision.

- Clean-checkout install, Prisma generation, production dependency audit, workspace
  typecheck, translation coverage, 278 automated tests and API/web/admin production builds
  pass. Evidence:
  `artifacts/release-gate-2026-07-26T17-08-48.014Z.json`.
- Broad browser interaction/accessibility (94 checks), localized browser (10 checks) and
  focused search browser (6 checks) pass on the same commit. Evidence:
  `artifacts/release-gate-2026-07-26T17-07-24.241Z.json`.
- The seven live HTTP suites pass 438 assertions across buyer/seller, filter/order, public
  web, admin, background jobs, security and performance.
- Flutter analysis and all 18 mobile tests pass.
- The reversible local restricted-safety workflow passes and removes every synthetic case.

Production remains NO-GO until the hard gates below have real deployment evidence. In
particular, the repository does not contain a vetted protected-hash provider adapter, and
the local development environment is not a substitute for production TLS, DNS, providers,
credentials, backup/restore, physical-device or operational sign-off.

## Credential and service ownership

Secrets live in the production secret manager or CI environment, never in this table or
the repository. “Primary” is the person who can rotate or recover the credential;
“backup” must independently have access before launch.

| Capability    | Required material                                          | Primary / backup              | Validation before go-live                                |
| ------------- | ---------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| PostgreSQL    | application and backup/restore credentials                 | Platform / incident lead      | readiness plus a timed restore drill                     |
| Redis         | password or managed-service token                          | Platform / incident lead      | readiness and worker heartbeat                           |
| Meilisearch   | master key and private endpoint                            | Search owner / platform       | smoke reports available with zero drift                  |
| R2/S3         | bucket, access key and secret                              | Media owner / platform        | upload, rendition fetch and delete lifecycle             |
| JWT           | distinct access and refresh secrets                        | Security / platform           | preflight length/difference checks                       |
| SMS           | MSG91 or Twilio production credentials                     | Growth ops / security         | one real OTP send, receive and verify                    |
| FCM server    | project ID, client email and private key                   | Mobile owner / platform       | one foreground and one background delivery               |
| Image safety  | Rekognition region and restricted IAM credentials/role     | Trust & safety / platform     | safe, review and reject calibration fixtures             |
| Child safety  | vetted protected-hash provider and named reporting officer | Legal / trust & safety        | no-match, unavailable and synthetic match contract tests |
| Android       | upload keystore, aliases and Play Console access           | Mobile owner / release backup | signed AAB and Play integrity checks                     |
| iOS           | distribution certificate/profile and App Store Connect     | Mobile owner / release backup | archive validation and TestFlight install                |
| TLS/DNS       | registrar, DNS and ACME recovery access                    | Platform / incident lead      | DNS, certificate chain and renewal dry run               |
| Sentry/logs   | DSNs, project access and alert ownership                   | On-call / incident lead       | controlled error arrives with correlation ID             |
| SMTP          | relay credentials and verified sender                      | Operations / platform         | delivery to an external mailbox                          |
| Smoke account | dedicated least-privilege admin login                      | QA / incident lead            | login, index status and logout all pass                  |

Rotation dates and emergency revocation steps belong in the secret manager entry. Confirm
that no single person is the only holder of signing, DNS, database or recovery access.

## Hard go/no-go gates

All of these are blocking:

- The candidate commit is reviewed, tagged and reproducible from a clean checkout.
- API tests, workspace typechecks, production builds and Flutter analysis/tests pass.
- `npm run acceptance:browser` passes, including real interactions, API state,
  runtime-error checks and WCAG A/AA scans.
- A production-like environment passes all broader acceptance and security gates.
- `npm run preflight:production -- --dns` reports zero failures. Warnings require a
  written owner and launch decision.
- `npm run verify:safety-readiness -- --env infrastructure/docker/.env` confirms the
  approved policy metadata, exact restricted role, an active console-ready officer and a
  provider compiled into the candidate.
- The database backup completes and the same backup restores successfully into an
  isolated database within the recovery-time target.
- Migrations are backward-compatible with the previous application images.
- `npm run smoke:production` passes with zero search-index drift.
- One real SMS OTP, media upload, chat notification and FCM push completes end to end.
- Android and iOS candidates install from their release channels and pass the buyer
  journey on physical devices.
- Dashboards, alerts, incident channel and rollback operator are active.

## Rehearsal sequence

Run this against the production-like host using the exact candidate and release
configuration. Store command output with the release record; never paste secret values.

```bash
npm run gate:release -- --stack --dns --env infrastructure/docker/.env

docker compose -f infrastructure/docker/docker-compose.prod.yml build --pull
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d
docker compose -f infrastructure/docker/docker-compose.prod.yml ps

LOCZ_PRODUCTION_URL=https://staging.locz.in \
LOCZ_ADMIN_URL=https://admin.staging.locz.in \
LOCZ_SMOKE_ADMIN_EMAIL=release-check@locz.in \
LOCZ_SMOKE_ADMIN_PASSWORD='read-from-the-secret-manager' \
npm run smoke:production
```

The release gate writes a secret-free JSON evidence record under `artifacts/`. It fails a
dirty worktree by default and runs install, production dependency audit, typechecks,
tests, builds, Flutter analysis/tests, browser/WCAG acceptance and preflight as
independent gates. Use `--evidence <path>` to place the record in release storage.
`--allow-dirty`, `--skip-install`, `--skip-node`, `--skip-mobile`, `--skip-browser`,
`--skip-preflight`, `--skip-http` and `--safety-development` exist for local diagnosis
only and are forbidden for final sign-off. Use `--synthetic-safety` only against an
isolated local non-production database; the gate records the reversible workflow as
skipped otherwise. Add `--smoke` only after the candidate stack is deployed and the
smoke-account environment variables are present.

Then perform the physical-device and provider checks from the hard-gate list. Verify
structured API logs, queue processing, error reporting, web analytics and Speed Insights.
The release owner signs the rehearsal only after evidence is attached.

## Launch timeline

### T-7 days

- Freeze schema-breaking changes and rehearse backup, restore and rollback.
- Verify provider quotas, billing, domain ownership, certificates and app-store access.
- Nominate the release owner, incident lead, operators and communication channel.
- Complete accessibility checks with keyboard, screen reader and 200% zoom in addition
  to the automated gate.

### T-24 hours

- Cut the immutable candidate and images; rerun every hard gate.
- Lower DNS TTL only if the documented traffic-switch plan requires it.
- Confirm support copy, status-page access, privacy/terms links and store metadata.
- Check that the previous image set remains deployable against the migrated schema.

### T-0

- Announce the window, pause unrelated deploys and take the final database backup.
- Run preflight, deploy, wait for migrations, then run production smoke.
- Manually complete sign-in, search/filter/sort, listing detail/save, posting, chat,
  business verification and moderation journeys.
- Release traffic/store rollout only after the release owner records “go”.

### T+1 hour and T+24 hours

- Review 5xx rate, readiness, latency, queue failures, index drift, SMS/push delivery,
  media errors, client errors and Core Web Vitals.
- Compare registration, OTP success, search-to-detail and post completion with the
  rehearsal baseline.
- Record incidents and either complete the release or invoke rollback.

## Rollback decision

Rollback immediately for data loss/corruption, authentication or authorization bypass,
inability to post or contact, sustained readiness failure, broken migrations, widespread
client crashes, or an error/security regression without a safe feature disable.

The application rollback is:

1. Stop rollout and announce the incident.
2. Capture correlation IDs, logs and current image digests.
3. Deploy the recorded previous image digests.
4. Keep the forward-migrated schema; do not restore an old database merely to match old
   code.
5. Re-run liveness, readiness and production smoke before restoring traffic.

A database restore is a separate disaster-recovery decision for confirmed data loss or
corruption. It requires the incident lead, a recovery point, a restored-data validation
plan and explicit acceptance of writes that will be lost.

## Launch sign-off

| Decision                       | Name | Time (IST) | Evidence / incident link |
| ------------------------------ | ---- | ---------- | ------------------------ |
| Engineering candidate accepted |      |            |                          |
| Security and privacy accepted  |      |            |                          |
| Database restore accepted      |      |            |                          |
| Mobile candidates accepted     |      |            |                          |
| Operations/on-call accepted    |      |            |                          |
| Release owner: GO / NO-GO      |      |            |                          |
