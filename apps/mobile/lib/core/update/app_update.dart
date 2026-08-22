import 'dart:async';

import 'package:dio/dio.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../config/env.dart';

/// A newer build than the one running.
class AvailableUpdate {
  const AvailableUpdate({
    required this.versionName,
    required this.versionCode,
    required this.url,
    required this.sizeBytes,
    required this.sha256,
  });

  final String versionName;
  final int versionCode;
  final String url;
  final int sizeBytes;

  /// Lower-case hex SHA-256 of the published APK, from the manifest. The installer verifies
  /// the downloaded file against this before handing it to the system installer, so a
  /// tampered manifest or a man-in-the-middle on the download cannot install a foreign APK.
  final String sha256;

  String get sizeLabel => '${(sizeBytes / 1048576).toStringAsFixed(0)} MB';
}

/// Checks whether a newer APK has been published.
///
/// LocZ is sideloaded rather than installed from the Play Store, so nothing tells a phone
/// that a new build exists — without this, a tester keeps using a month-old app and reports
/// bugs that were fixed weeks ago. The website publishes a small manifest next to the APK
/// and this reads it.
///
/// Comparison is on `versionCode`, the integer after `+` in pubspec, never on the version
/// name. Names are for humans and sort wrongly: as strings, "1.10.0" is less than "1.9.0",
/// so a name-based check would silently stop offering updates after the tenth patch.
///
/// Deliberately quiet on failure. An update check is a convenience; it must never block
/// someone from opening the app because a manifest was briefly unreachable.
class AppUpdateChecker {
  AppUpdateChecker({Dio? client, PackageInfo? packageInfo})
      : _client = client ?? Dio(),
        _packageInfo = packageInfo;

  final Dio _client;
  PackageInfo? _packageInfo;

  /// Where the manifest lives, derived from the site the build points at, so a staging
  /// build checks staging and a production build checks production.
  String get manifestUrl => '${Env.siteUrl}/download/latest.json';

  Future<AvailableUpdate?> check() async {
    try {
      final info = _packageInfo ??= await PackageInfo.fromPlatform();
      final current = int.tryParse(info.buildNumber) ?? 0;

      final response = await _client.get<Map<String, dynamic>>(
        manifestUrl,
        options: Options(
          receiveTimeout: const Duration(seconds: 8),
          sendTimeout: const Duration(seconds: 8),
          // A cached manifest defeats the point of checking.
          headers: const {'Cache-Control': 'no-cache'},
        ),
      );

      final body = response.data;
      if (body == null) return null;

      final code = body['versionCode'];
      final url = body['url'];
      final sha = body['sha256'];
      // Without a checksum we cannot verify the download, so treat the manifest as unusable
      // rather than installing an unverifiable APK.
      if (code is! int || url is! String || sha is! String || sha.isEmpty) return null;

      // Only ever offer a *newer* build. Equal means up to date; lower means the phone is
      // ahead of the manifest, which happens while a release is mid-publish and must not
      // prompt somebody to downgrade.
      if (code <= current) return null;

      return AvailableUpdate(
        versionName: body['versionName'] as String? ?? '$code',
        versionCode: code,
        url: url,
        sizeBytes: body['sizeBytes'] as int? ?? 0,
        sha256: sha.toLowerCase(),
      );
    } on DioException {
      return null;
    } on FormatException {
      return null;
    }
  }
}
