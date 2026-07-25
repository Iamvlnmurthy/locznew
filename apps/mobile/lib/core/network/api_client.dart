import 'dart:async';

import 'package:dio/dio.dart';

import '../config/env.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// HTTP client for the LocZ API.
///
/// Two interceptor concerns live here so no call site has to think about them:
///
///  1. the access token is attached automatically;
///  2. a 401 triggers exactly one refresh, and every request that was in flight during
///     that refresh waits for it and then retries. Without the single-flight guard, a
///     screen firing five parallel requests on a stale token would burn five refresh
///     tokens — and rotation means four of those would be treated as replay and revoke
///     the whole session.
class ApiClient {
  ApiClient(this._tokens) {
    _dio = Dio(
      BaseOptions(
        baseUrl: Env.apiBaseUrl,
        connectTimeout: const Duration(seconds: 12),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Content-Type': 'application/json'},
        // Non-2xx is handled explicitly below rather than by throwing DioException.
        validateStatus: (status) => status != null && status < 500,
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (options.extra['skipAuth'] != true) {
            final token = await _tokens.readAccessToken();
            if (token != null) options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  late final Dio _dio;
  final TokenStorage _tokens;

  /// Held while a refresh is in progress so concurrent 401s wait rather than racing.
  Future<bool>? _refreshInFlight;

  /// Called when refresh fails — the app routes to sign-in.
  void Function()? onSessionExpired;

  Future<T> get<T>(String path, {Map<String, dynamic>? query, bool auth = true}) =>
      _send<T>(() => _dio.get(path, queryParameters: query, options: _options(auth)), auth);

  Future<T> post<T>(String path, {Object? body, bool auth = true}) =>
      _send<T>(() => _dio.post(path, data: body, options: _options(auth)), auth);

  Future<T> patch<T>(String path, {Object? body}) =>
      _send<T>(() => _dio.patch(path, data: body, options: _options(true)), true);

  Future<T> delete<T>(String path) =>
      _send<T>(() => _dio.delete(path, options: _options(true)), true);

  Options _options(bool auth) => Options(extra: {'skipAuth': !auth});

  Future<T> _send<T>(Future<Response<dynamic>> Function() request, bool auth) async {
    Response<dynamic> response;
    try {
      response = await request();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }

    if (response.statusCode == 401 && auth) {
      final refreshed = await _refreshOnce();
      if (!refreshed) {
        onSessionExpired?.call();
        throw const ApiException(
          'Your session has expired. Please sign in again.',
          401,
          'Unauthorized',
        );
      }

      try {
        response = await request();
      } on DioException catch (error) {
        throw ApiException.fromDio(error);
      }
    }

    final status = response.statusCode ?? 500;
    final data = response.data;

    if (status >= 400) {
      throw ApiException.fromPayload(data, status);
    }

    // The API wraps everything in { success, data } — unwrap once here so features
    // work with domain shapes.
    if (data is Map<String, dynamic> && data.containsKey('data')) {
      return data['data'] as T;
    }
    return data as T;
  }

  Future<bool> _refreshOnce() {
    // Single-flight: everyone who arrives during a refresh awaits the same future.
    return _refreshInFlight ??= _performRefresh().whenComplete(() => _refreshInFlight = null);
  }

  Future<bool> _performRefresh() async {
    final refreshToken = await _tokens.readRefreshToken();
    if (refreshToken == null) return false;

    try {
      final response = await _dio.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {'skipAuth': true}),
      );

      if ((response.statusCode ?? 500) >= 400) return false;

      final payload = response.data as Map<String, dynamic>;
      final tokens = (payload['data'] as Map<String, dynamic>)['tokens'] as Map<String, dynamic>;

      await _tokens.saveTokens(
        accessToken: tokens['accessToken'] as String,
        refreshToken: tokens['refreshToken'] as String,
      );
      return true;
    } catch (_) {
      return false;
    }
  }
}
