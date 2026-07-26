import 'package:dio/dio.dart';

/// One error type for the whole app, so every screen renders failures the same way.
class ApiException implements Exception {
  const ApiException(this.message, this.statusCode, this.code);

  final String message;
  final int statusCode;
  final String code;

  /// The API's error envelope: `{ success: false, error: { code, message } }`.
  factory ApiException.fromPayload(dynamic payload, int statusCode) {
    if (payload is Map<String, dynamic>) {
      final error = payload['error'];
      if (error is Map<String, dynamic>) {
        return ApiException(
          error['message']?.toString() ?? 'Something went wrong',
          statusCode,
          error['code']?.toString() ?? 'Error',
        );
      }
    }
    return ApiException('Something went wrong', statusCode, 'Error');
  }

  /// Transport-level failures. The messages are written for a user on a patchy mobile
  /// connection, not for a developer reading a stack trace.
  factory ApiException.fromDio(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const ApiException(
          'The connection timed out. Check your network.',
          0,
          'Timeout',
        );
      case DioExceptionType.connectionError:
        return const ApiException('No internet connection.', 0, 'Offline');
      default:
        return ApiException(
          error.message ?? 'Something went wrong',
          error.response?.statusCode ?? 0,
          'NetworkError',
        );
    }
  }

  bool get isOffline => code == 'Offline' || code == 'Timeout';
  bool get isRateLimited => statusCode == 429;

  @override
  String toString() => message;
}
