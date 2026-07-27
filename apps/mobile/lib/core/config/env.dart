import 'package:flutter/foundation.dart';

/// Build-time configuration.
///
/// Values come from `--dart-define` so no environment file is bundled into the APK and
/// nothing sensitive is committed:
///
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
///
/// 10.0.2.2 is how the Android emulator reaches the host machine; a physical device
/// needs the host's LAN address instead.
class Env {
  const Env._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000/api/v1',
  );

  static const String siteUrl = String.fromEnvironment('SITE_URL', defaultValue: 'https://locz.in');

  static const String appName = 'LocZ';

  /// Radius options offered in the nearby filter, mirroring the API's presets.
  static const List<int> radiusPresetsKm = [1, 3, 5, 10, 25, 50];

  /// Whether this configuration is safe to ship.
  ///
  /// The default `apiBaseUrl` points at the emulator's route to the host machine over plain
  /// HTTP, which is right for development and catastrophic in a store build: forgetting one
  /// `--dart-define` would produce a signed release that talks to `10.0.2.2` in cleartext.
  /// Android blocks that from API 28, so the failure would surface as an app that installs,
  /// launches, and then cannot load anything — a defect that reads like a backend outage.
  static bool get isReleaseSafe =>
      apiBaseUrl.startsWith('https://') && siteUrl.startsWith('https://');

  /// Throws when a release build was configured for development.
  ///
  /// Deliberately fatal, and deliberately at startup. A release pointed at a development
  /// endpoint is not a degraded app to be nursed along; it is one that must not reach a
  /// user, and failing on the first launch of an internal test build is the cheapest
  /// possible moment to find out.
  static void assertReleaseConfiguration() {
    if (!kReleaseMode || isReleaseSafe) return;

    throw StateError(
      'This release build is configured for development: API_BASE_URL=$apiBaseUrl, '
      'SITE_URL=$siteUrl. Build with '
      '--dart-define=API_BASE_URL=https://api.locz.in/api/v1 '
      '--dart-define=SITE_URL=https://locz.in',
    );
  }

  static const int maxImagesPerListing = 12;
  static const int maxImageBytes = 10 * 1024 * 1024;
}
