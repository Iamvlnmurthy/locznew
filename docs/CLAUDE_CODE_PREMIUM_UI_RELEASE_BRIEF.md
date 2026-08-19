# Claude Code brief — premium UI release, VPS deploy, and Android APK

Use this brief from the repository root after the premium UI changes have been reviewed and
committed. Do not bypass a failed gate, expose a secret in output, or deploy from a dirty tree.

## Objective

Release the premium, mobile-first LocZ interface to the production VPS, then build and publish
the matching signed Android APK. Preserve the existing API, database, search index, user data,
uploads, TLS configuration, and application identifier `com.locz.app`.

The UI release includes:

- premium elevation, surface, motion, form, button, empty-state, and card foundations;
- redesigned nearby-business cards with logo/category artwork, useful metadata, verification,
  listing counts, profile navigation, and directions;
- responsive business cards verified at 390 px and 1440 px without horizontal overflow;
- matching Flutter business cards and a less cramped native theme;
- complete English, Telugu, and Hindi web strings for the new card actions.

## Non-negotiable safety rules

1. Read `docs/DEPLOYMENT.md`, `docs/MOBILE_SETUP.md`, and `docs/LAUNCH_RUNBOOK.md` first.
2. Confirm `git status --short` is empty and record `git rev-parse HEAD` before deployment.
3. Never print, copy into chat, or commit `.env`, the upload keystore, `key.properties`, Firebase
   service-account values, JWT secrets, database credentials, or Meilisearch credentials.
4. Back up PostgreSQL before rebuilding the production stack.
5. Use migrations; do not reset or restore the production database merely to match application
   code.
6. Release signing must fail closed if the private upload key is unavailable. Never substitute
   the Android debug key.
7. Keep the existing application id, signing key, API origin, and download paths.

## 1. Verify the release candidate

```bash
git status --short
git rev-parse HEAD
npm ci
npm run db:generate -w @locz/api
npm run typecheck
npm run check:i18n
npm test
npm run build
cd apps/mobile
flutter pub get
flutter analyze
flutter test
cd ../..
git diff --check
```

If the local API-backed stack is available, also run:

```bash
npm run acceptance:responsive
npm run acceptance:browser
npm run acceptance:localized-browser
npm run acceptance:search-browser
```

Stop on any unexpected failure. Do not label a skipped browser or live-stack check as passed.

## 2. Prepare production configuration

On the VPS, deploy the reviewed commit to the existing LocZ checkout. Confirm
`infrastructure/docker/.env` exists with mode `600`; do not replace it with the repository-root
development environment.

Before building, confirm the public build-time values resolve to production HTTPS endpoints:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_ADMIN_API_BASE_URL`
- `NEXT_PUBLIC_SITE_URL`

Run the production preflight without displaying secret values:

```bash
npm run preflight:production -- --dns
```

## 3. Back up, deploy, and migrate on the VPS

Follow the repository backup procedure first. Then:

```bash
docker compose -f infrastructure/docker/docker-compose.prod.yml build --pull
docker compose -f infrastructure/docker/docker-compose.prod.yml up -d
docker compose -f infrastructure/docker/docker-compose.prod.yml ps
```

The `migrate` service must complete successfully before the API is considered healthy. Inspect
only the relevant container status/logs if it does not.

Verify the deployment:

```bash
curl --fail https://locz.in/api/v1/health/live
curl --fail https://locz.in/api/v1/health/ready
LOCZ_WEB=https://locz.in node scripts/acceptance-deployed.mjs
```

Run the authenticated production smoke using credentials supplied through the secret manager,
not command history:

```bash
npm run smoke:production
```

Confirm the homepage, search page, business directory, one business profile, sign-in, Telugu,
Hindi, light theme, dark theme, and a 390 px viewport. Specifically verify that nearby-business
cards show no initial-only placeholder, no large empty region, no overlapping actions, and no
horizontal scrolling.

## 4. Build the signed Android release

Before building, increment `version:` in `apps/mobile/pubspec.yaml` from the currently published
version. Both the semantic version and integer build number must move forward.

Make the four signing values available through the protected CI/VPS environment or the ignored
`apps/mobile/android/key.properties` file:

- `LOCZ_UPLOAD_STORE_FILE`
- `LOCZ_UPLOAD_STORE_PASSWORD`
- `LOCZ_UPLOAD_KEY_ALIAS`
- `LOCZ_UPLOAD_KEY_PASSWORD`

Then build the universal release APK with the production endpoints:

```bash
cd apps/mobile
flutter clean
flutter pub get
flutter analyze
flutter test
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.locz.in/api/v1 \
  --dart-define=SITE_URL=https://locz.in \
  --dart-define=GOOGLE_CLIENT_ID="$LOCZ_GOOGLE_CLIENT_ID"
```

Do not continue unless `build/app/outputs/flutter-apk/app-release.apk` exists and is release
signed. Record its size and SHA-256 checksum without exposing signing data.

## 5. Publish the APK safely

The repository already implements versioned upload, remote checksum verification, atomic stable
link replacement, and `latest.json` generation. From a trusted Linux/macOS shell with the
configured SSH alias and signing environment, run:

```bash
cd /path/to/locz
./scripts/publish-apk.sh
```

Do not manually overwrite `locz-latest.apk`. The script uploads a versioned file first and only
repoints the stable link after its remote SHA-256 matches.

Verify:

```bash
curl --fail https://locz.in/download/latest.json
curl --fail --head https://locz.in/download/locz-latest.apk
```

Install the published APK on a physical Android device and smoke-test location selection, home
feed, nearby business cards, directions, business profile, search, sign-in, posting, dark mode,
Telugu, Hindi, and the in-app update check.

## 6. Release report

Return a concise report containing:

- deployed Git commit;
- database backup identifier;
- migration, health, deployed-browser, and smoke results;
- APK version name and version code;
- local and remote APK SHA-256 values;
- published APK and manifest URLs;
- any skipped check, warning, or rollback action.

Do not report the release complete until both the web deployment and installed physical-device
APK smoke test pass.
