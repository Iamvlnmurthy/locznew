# Flutter setup

> **Status: verified.** The Android app has passed `flutter analyze`, unit tests, a
> debug APK build, emulator launch, and the live-API buyer integration journey.

## Prerequisites

- Flutter 3.24+ (`flutter doctor` must be clean for your target platforms)
- Android Studio with an SDK 34+ emulator, and/or Xcode 15+ with a simulator

## Platform identity

Android and iOS platform projects are committed. Both use the stable application
identifier `com.locz.app`; do not change it after a store release. Firebase apps,
Digital Asset Links, and Apple associated domains must use the same identifier.

## Install and check

```bash
cd apps/mobile
flutter pub get
flutter analyze          # expect findings on the first run
```

## Run against a local API

The API base URL is a compile-time constant, so it is passed with `--dart-define`:

```bash
# Android emulator — 10.0.2.2 is how it reaches the host
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1

# iOS simulator — shares the host's network stack
flutter run --dart-define=API_BASE_URL=http://localhost:4000/api/v1

# Physical device — the host's LAN address, and the phone must be on the same network
flutter run --dart-define=API_BASE_URL=http://192.168.1.x:4000/api/v1
```

Sign in with a seeded number (`9000000004`); the mock provider shows the code on screen.

## Cleartext HTTP in development

Android 9+ and iOS block plain HTTP. For local development only:

**`android/app/src/main/AndroidManifest.xml`** — on `<application>`:

```xml
android:usesCleartextTraffic="true"
```

**`ios/Runner/Info.plist`**:

```xml
<key>NSAppTransportSecurity</key>
<dict><key>NSAllowsLocalNetworking</key><true/></dict>
```

Remove both before shipping. Production is HTTPS-only.

## Permissions

**`AndroidManifest.xml`**

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

Coarse location only: LocZ needs the city, not the street. Requesting fine location for
a classifieds app is a permission users decline and a privacy cost with no benefit.

**`Info.plist`** — every string here is shown to the user, so it explains the benefit
rather than restating the permission:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>LocZ uses your location to show ads, jobs and offers near you.</string>
<key>NSCameraUsageDescription</key>
<string>Take photos of the item you are selling.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Add photos to your ad from your gallery.</string>
```

## Firebase (optional)

Firebase is configuration-gated: local builds with no client identifiers skip
initialisation and remain fully usable. A configured build starts FCM, registers the
current token only after session restoration, handles token rotation, foreground
messages, and notification-open routing.

1. Create a Firebase project; add an Android app (`com.locz.app`) and an iOS app
2. Copy `firebase.example.json` to the gitignored `firebase.json` and fill in the
   non-secret client identifiers from Firebase project settings
3. Build or run with `--dart-define-from-file=firebase.json`
4. For iOS, enable Push Notifications and Background Modes → Remote notifications in
   Xcode, then upload the APNs authentication key to Firebase
5. Set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` on the API

```bash
flutter run \
  --dart-define-from-file=firebase.json \
  --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

The permission prompt is fired after the user publishes an ad or sends a message, not
at launch. The server-side service-account values are secrets; never place those three
values in `firebase.json` or the mobile binary.

`MOBILE_SENTRY_DSN` in the same build-definition file is optional. When present,
uncaught Flutter, platform and Dart-zone failures are reported after contact details,
credentials and URL queries are removed. See `docs/OBSERVABILITY.md`.

## Google sign-in

Google sign-in is configuration-gated. Pass the **web OAuth client ID** as
`GOOGLE_CLIENT_ID`; the app supplies it to `google_sign_in` as `serverClientId`, which
makes Google mint an ID token for the audience verified by the API.

```bash
--dart-define=GOOGLE_CLIENT_ID=327351912011-9332b953dn137qsnukmgbrljj0g3u1t5.apps.googleusercontent.com
```

Do not pass the Android OAuth client ID as `serverClientId`. The Android credential is
registered in Google Cloud for package `com.locz.app` and the release signing SHA-1;
Google selects it from the installed app's signature. Putting that client ID in the Dart
build produces a token with the wrong audience, which the LocZ API correctly rejects.

An empty `GOOGLE_CLIENT_ID` hides the Google control rather than exposing a sign-in path
that cannot succeed.

## Deep links

Routes mirror the web app, so one URL serves both: `https://locz.in/ad/<slug>` opens the
app when installed and the site when not. Requires `assetlinks.json` (Android) and an
Apple App Site Association file, both served from the web app's `public/.well-known/`.

## Design tokens

Colours, spacing and radii are generated from the shared TypeScript source. Never edit
`lib/core/theme/tokens.g.dart` by hand — change `packages/ui-tokens/src/index.ts` and:

```bash
npm run build:dart -w @locz/ui-tokens
```

## Release builds

Android release artifacts require the private upload key and will fail closed when it
is missing. Copy `android/key.properties.example` to `android/key.properties` and
replace every placeholder, or provide these CI secrets:

- `LOCZ_UPLOAD_STORE_FILE`
- `LOCZ_UPLOAD_STORE_PASSWORD`
- `LOCZ_UPLOAD_KEY_ALIAS`
- `LOCZ_UPLOAD_KEY_PASSWORD`

The keystore and `key.properties` are gitignored. Back up the upload key in a secure
credential vault; never send it through chat or commit it.

> **Canonical endpoints (do not drift):** the app talks to the API at
> `https://api.locz.in/api/v1` and links to the site at `https://locz.in`. These are the
> values `scripts/publish-apk.sh` uses and every published APK is built with; keep every
> `--dart-define` and doc in agreement with them. (`https://locz.in/api/v1` also resolves in
> production via path routing, but `api.locz.in` is the one release config.)

```bash
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://api.locz.in/api/v1 \
  --dart-define=SITE_URL=https://locz.in \
  --dart-define=GOOGLE_CLIENT_ID=327351912011-9332b953dn137qsnukmgbrljj0g3u1t5.apps.googleusercontent.com

flutter build ipa --release \
  --dart-define=API_BASE_URL=https://api.locz.in/api/v1 \
  --dart-define=SITE_URL=https://locz.in
```

After the upload certificate exists, publish
`https://locz.in/.well-known/assetlinks.json` for package `com.locz.app` and its SHA-256
certificate fingerprint. The manifest already declares verified `/ad/` links and the
`locz://ad/` fallback.

## Android integration gate

With the API running locally and an emulator connected:

```bash
flutter test integration_test/buyer_journey_test.dart \
  -d emulator-5554 \
  --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

The gate signs in with the seeded buyer, restores the session through secure storage,
loads the live feed and account, exercises database-backed search and its empty state,
opens another person's listing, and proves save/unsave reaches the API. Its teardown
restores the listing's original saved state. Override `LOCZ_INTEGRATION_EMAIL` and
`LOCZ_INTEGRATION_PASSWORD` with `--dart-define` when using another test account.
