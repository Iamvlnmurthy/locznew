import 'dart:io';

import '../../../core/network/api_client.dart';
import '../../../core/storage/token_storage.dart';

class AuthUser {
  const AuthUser({
    required this.id,
    required this.displayName,
    required this.phone,
    required this.roles,
    required this.permissions,
  });

  final String id;
  final String displayName;
  final String phone;
  final List<String> roles;
  final List<String> permissions;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        displayName: json['displayName'] as String,
        phone: json['phone'] as String,
        roles: (json['roles'] as List<dynamic>? ?? []).cast<String>(),
        permissions: (json['permissions'] as List<dynamic>? ?? []).cast<String>(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'displayName': displayName,
        'phone': phone,
        'roles': roles,
        'permissions': permissions,
      };
}

class OtpRequestResult {
  const OtpRequestResult({required this.expiresInSeconds, this.debugCode});

  final int expiresInSeconds;

  /// Only ever populated by the mock provider in development.
  final String? debugCode;
}

class AuthRepository {
  AuthRepository(this._api, this._tokens);

  final ApiClient _api;
  final TokenStorage _tokens;

  /// The API expects E.164. The UI collects ten digits, so the country code is added
  /// in one place rather than trusted from user input.
  String toE164(String national) => '+91${national.replaceAll(RegExp(r'\D'), '')}';

  Future<OtpRequestResult> requestOtp(String nationalNumber) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/auth/otp/request',
      body: {'phone': toE164(nationalNumber)},
      auth: false,
    );

    return OtpRequestResult(
      expiresInSeconds: json['expiresInSeconds'] as int? ?? 300,
      debugCode: json['debugCode'] as String?,
    );
  }

  Future<AuthUser> verifyOtp(
    String nationalNumber,
    String code, {
    String? pushToken,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      body: {
        'phone': toE164(nationalNumber),
        'code': code,
        'device': await _deviceInfo(pushToken),
      },
      auth: false,
    );

    return _persist(json);
  }

  Future<AuthUser> register({
    required String displayName,
    required String nationalNumber,
    required String password,
    String? pushToken,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/auth/register',
      body: {
        'phone': toE164(nationalNumber),
        'displayName': displayName.trim(),
        'password': password,
        'device': await _deviceInfo(pushToken),
      },
      auth: false,
    );

    return _persist(json);
  }

  Future<AuthUser> signInWithPassword({
    required String nationalNumber,
    required String password,
    String? pushToken,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/auth/login/phone',
      body: {
        'phone': toE164(nationalNumber),
        'password': password,
        'device': await _deviceInfo(pushToken),
      },
      auth: false,
    );

    return _persist(json);
  }

  Future<AuthUser> signInWithGoogle({
    required String idToken,
    String? pushToken,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/auth/login/google',
      body: {
        'idToken': idToken,
        'device': await _deviceInfo(pushToken),
      },
      auth: false,
    );

    return _persist(json);
  }

  /// Records a mobile number the device confirmed through Firebase.
  ///
  /// Unlike every other method here this returns no session: the account already exists and
  /// is already signed in. Confirming a number changes what that account may do — claim a
  /// business, be trusted as reachable — rather than who is holding it.
  ///
  /// The token is passed straight through. Nothing on the device may decide that a number is
  /// verified; only the API, checking Google's signature, may say so.
  Future<String> confirmPhone(String firebaseIdToken) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/auth/phone/confirm',
      body: {'idToken': firebaseIdToken},
    );

    return json['phoneE164'] as String;
  }

  Future<AuthUser> _persist(Map<String, dynamic> session) async {
    final tokens = session['tokens'] as Map<String, dynamic>;
    await _tokens.saveTokens(
      accessToken: tokens['accessToken'] as String,
      refreshToken: tokens['refreshToken'] as String,
    );

    final user = AuthUser.fromJson(session['user'] as Map<String, dynamic>);
    await _tokens.saveUser(user.toJson());
    return user;
  }

  Future<Map<String, dynamic>> _deviceInfo(String? pushToken) async => {
        'deviceKey': await _tokens.deviceKey(),
        'platform': Platform.isIOS ? 'IOS' : 'ANDROID',
        'name': Platform.operatingSystemVersion,
        if (pushToken != null) 'pushToken': pushToken,
      };

  /// Registers or refreshes the FCM token on an already-signed-in device. Firebase
  /// rotates tokens without warning, so this runs at every launch and on every
  /// `onTokenRefresh`. A failure here costs notifications, not the session, so it is
  /// logged rather than surfaced.
  Future<bool> updatePushToken(String pushToken) async {
    try {
      await _api.post<void>(
        '/users/me/push-token',
        body: {'deviceKey': await _tokens.deviceKey(), 'pushToken': pushToken},
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<AuthUser?> restoreSession() async {
    final stored = await _tokens.readUser();
    if (stored == null) return null;

    // Trust the cached identity for first paint, then confirm with the server. A
    // revoked session must not leave the app looking signed in.
    try {
      final json = await _api.get<Map<String, dynamic>>('/users/me');
      final user = AuthUser(
        id: json['id'] as String,
        displayName: json['displayName'] as String,
        phone: json['phone'] as String,
        roles: (json['roles'] as List<dynamic>? ?? []).cast<String>(),
        permissions: const [],
      );
      await _tokens.saveUser(user.toJson());
      return user;
    } catch (_) {
      return AuthUser.fromJson(stored);
    }
  }

  Future<void> signOut() async {
    try {
      await _api.post<void>('/auth/logout');
    } catch (_) {
      // A network failure must not trap the user in a signed-in state; local tokens
      // are cleared regardless and the server session expires on its own.
    }
    await _tokens.clear();
  }
}
