import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Push notifications.
///
/// The permission prompt is deliberately *not* fired at first launch: asking before the
/// user has any reason to want notifications is the reliable way to get a permanent
/// "no" on iOS. It is requested after the first meaningful action — posting an ad or
/// sending an enquiry — where the value is obvious.
class PushService {
  PushService(this._onToken, this._onOpenRoute);

  final Future<void> Function(String token) _onToken;
  final void Function(String route) _onOpenRoute;

  final _local = FlutterLocalNotificationsPlugin();
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  bool _initialised = false;

  Future<void> initialise() async {
    if (_initialised) return;
    _initialised = true;

    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          // Handled by the explicit request below instead.
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (response) {
        final route = response.payload;
        if (route != null && route.isNotEmpty) _onOpenRoute(route);
      },
    );

    // Android shows a foreground notification only if a channel exists.
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            'locz_default',
            'LocZ',
            description: 'Enquiries, listing updates and nearby offers',
            importance: Importance.high,
          ),
        );

    // A token can exist before permission is granted (Android), so it is registered
    // as soon as it is available and refreshed whenever Firebase rotates it.
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _onToken(token);
    _subscriptions.add(FirebaseMessaging.instance.onTokenRefresh.listen(_onToken));

    _subscriptions.add(FirebaseMessaging.onMessage.listen(_showForeground));
    _subscriptions.add(FirebaseMessaging.onMessageOpenedApp.listen(_handleOpen));

    // The notification that cold-started the app.
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _handleOpen(initial);
  }

  Future<void> dispose() async {
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
    _subscriptions.clear();
    _initialised = false;
  }

  /// Call after a meaningful action, not at startup.
  Future<bool> requestPermission() async {
    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  /// iOS suppresses notifications while the app is in the foreground, and Android's
  /// behaviour varies by OEM — showing them locally makes it consistent on both.
  Future<void> _showForeground(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    await _local.show(
      notification.hashCode,
      notification.title,
      notification.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'locz_default',
          'LocZ',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: message.data['route'] as String?,
    );
  }

  void _handleOpen(RemoteMessage message) {
    final route = message.data['route'] as String?;
    if (route != null && route.isNotEmpty) {
      _onOpenRoute(route);
    } else if (kDebugMode) {
      debugPrint('Push opened with no route: ${message.data}');
    }
  }
}
