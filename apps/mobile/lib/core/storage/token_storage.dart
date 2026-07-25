import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Session tokens, held in the Android Keystore / iOS Keychain.
///
/// Never `shared_preferences`: that is plain XML on Android and readable by anything
/// with filesystem access on a rooted device. A refresh token is the most valuable
/// credential the app holds.
class TokenStorage {
  TokenStorage([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
          );

  final FlutterSecureStorage _storage;

  static const _accessKey = 'locz.access_token';
  static const _refreshKey = 'locz.refresh_token';
  static const _userKey = 'locz.user';
  static const _deviceKey = 'locz.device_key';

  Future<String?> readAccessToken() => _storage.read(key: _accessKey);
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
  }

  Future<void> saveUser(Map<String, dynamic> user) =>
      _storage.write(key: _userKey, value: jsonEncode(user));

  Future<Map<String, dynamic>?> readUser() async {
    final raw = await _storage.read(key: _userKey);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      // Corrupt entry — treat as signed out rather than crashing at startup.
      await _storage.delete(key: _userKey);
      return null;
    }
  }

  /// Stable per-install identifier. Generated once so re-signing in replaces the
  /// device record on the server instead of accumulating one per session.
  Future<String> deviceKey() async {
    final existing = await _storage.read(key: _deviceKey);
    if (existing != null) return existing;

    final generated = 'mobile-${DateTime.now().microsecondsSinceEpoch}-${_random()}';
    await _storage.write(key: _deviceKey, value: generated);
    return generated;
  }

  static String _random() =>
      List.generate(8, (_) => '0123456789abcdef'[DateTime.now().microsecond % 16]).join();

  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _userKey);
    // The device key deliberately survives sign-out: it identifies the installation,
    // not the person.
  }
}
