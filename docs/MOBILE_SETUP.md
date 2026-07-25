# Flutter setup

> **Status: unverified.** This application was authored on a machine without the Flutter
> SDK. It has never been compiled, analysed or run. Expect `flutter analyze` to report
> issues on the first pass — work through them before assuming a screen is broken.

## Prerequisites

- Flutter 3.24+ (`flutter doctor` must be clean for your target platforms)
- Android Studio with an SDK 34+ emulator, and/or Xcode 15+ with a simulator

## Platform directories

`android/` and `ios/` are **not** committed — they are generated. From `apps/mobile`:

```bash
flutter create --platforms=android,ios --org in.locz --project-name locz .
```

This adds the platform folders without touching `lib/`, `pubspec.yaml` or
`analysis_options.yaml`.

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

The app runs without Firebase — `main.dart` deliberately does not call
`Firebase.initializeApp`, so a missing config file cannot crash startup. To enable push:

1. Create a Firebase project; add an Android app (`in.locz`) and an iOS app
2. Place `google-services.json` in `android/app/` and `GoogleService-Info.plist` in
   `ios/Runner/` — both are gitignored and must stay that way
3. Uncomment the initialisation in `main.dart` and start `PushService`
4. Set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` on the API

The permission prompt is fired after the user's first meaningful action, not at launch —
asking cold is how an app earns a permanent "no" on iOS.

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

```bash
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://locz.in/api/v1 \
  --dart-define=SITE_URL=https://locz.in

flutter build ipa --release \
  --dart-define=API_BASE_URL=https://locz.in/api/v1 \
  --dart-define=SITE_URL=https://locz.in
```
