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

  static const int maxImagesPerListing = 12;
  static const int maxImageBytes = 10 * 1024 * 1024;
}
