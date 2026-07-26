import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// Minimal Sentry Store client for uncaught mobile failures.
///
/// The DSN contains only a public ingestion key. User identity, breadcrumbs, request
/// bodies and device identifiers are deliberately not collected.
class MobileErrorReporter {
  MobileErrorReporter({
    String dsn = const String.fromEnvironment('MOBILE_SENTRY_DSN'),
    this.environment = const String.fromEnvironment(
      'APP_ENV',
      defaultValue: 'development',
    ),
  }) {
    if (dsn.isEmpty) return;
    try {
      final parsed = Uri.parse(dsn);
      final projectId = parsed.pathSegments.last;
      if (!parsed.hasScheme ||
          parsed.host.isEmpty ||
          parsed.userInfo.isEmpty ||
          projectId.isEmpty) {
        return;
      }
      _publicKey = parsed.userInfo.split(':').first;
      _endpoint = parsed.replace(
        userInfo: '',
        path: '/api/$projectId/store/',
        query: '',
        fragment: '',
      );
    } on FormatException {
      // Monitoring must never make startup load-bearing.
    }
  }

  final String environment;
  Uri? _endpoint;
  String? _publicKey;

  bool get isEnabled => _endpoint != null && _publicKey != null;

  Future<void> capture(
    Object error,
    StackTrace stack, {
    required String mechanism,
  }) async {
    final endpoint = _endpoint;
    final publicKey = _publicKey;
    if (endpoint == null || publicKey == null) return;

    final client = HttpClient()..connectionTimeout = const Duration(seconds: 3);
    try {
      final request = await client.postUrl(endpoint).timeout(const Duration(seconds: 3));
      request.headers.contentType = ContentType.json;
      request.headers.set(
        'X-Sentry-Auth',
        'Sentry sentry_version=7, sentry_client=locz-flutter/1.0, sentry_key=$publicKey',
      );
      request.write(
        jsonEncode({
          'event_id': _eventId(),
          'timestamp': DateTime.now().toUtc().toIso8601String(),
          'platform': 'dart',
          'level': 'error',
          'environment': environment,
          'logger': 'locz-mobile',
          'exception': {
            'values': [
              {
                'type': error.runtimeType.toString(),
                'value': sanitizeMessage(error.toString()),
                'stacktrace': {'frames': _frames(stack)},
                'mechanism': {'type': mechanism, 'handled': false},
              },
            ],
          },
        }),
      );
      final response = await request.close().timeout(const Duration(seconds: 3));
      await response.drain<void>();
    } catch (reportingError) {
      if (kDebugMode) {
        debugPrint(
          'Could not report mobile error: ${reportingError.runtimeType}',
        );
      }
    } finally {
      client.close(force: true);
    }
  }

  @visibleForTesting
  static String sanitizeMessage(String message) {
    final scrubbed = message
        .replaceAllMapped(
          RegExp(r'https?://([^\s?]+)\?[^\s]+'),
          (match) => 'https://${match.group(1)}?[redacted]',
        )
        .replaceAll(RegExp(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}'), '[email]')
        .replaceAll(RegExp(r'(?<!\d)(?:\+91[- ]?)?[6-9]\d{9}(?!\d)'), '[phone]')
        .replaceAllMapped(
          RegExp(
            r'(bearer|token|password|otp|code)\s*[:=]\s*\S+',
            caseSensitive: false,
          ),
          (match) => '${match.group(1)}=[redacted]',
        );
    return scrubbed.length > 500 ? scrubbed.substring(0, 500) : scrubbed;
  }

  static List<Map<String, Object>> _frames(StackTrace stack) {
    final pattern = RegExp(r'#\d+\s+(.+?)\s+\((.+?):(\d+):\d+\)');
    return stack
        .toString()
        .split('\n')
        .map(pattern.firstMatch)
        .whereType<RegExpMatch>()
        .take(40)
        .map(
          (match) => <String, Object>{
            'function': match.group(1) ?? '<unknown>',
            'filename': match.group(2) ?? '<unknown>',
            'lineno': int.tryParse(match.group(3) ?? '') ?? 0,
          },
        )
        .toList()
        .reversed
        .toList();
  }

  static String _eventId() {
    final seed = '${DateTime.now().microsecondsSinceEpoch}-${Object().hashCode}';
    return base64Url
        .encode(utf8.encode(seed))
        .replaceAll('=', '')
        .padRight(32, '0')
        .substring(0, 32);
  }
}
