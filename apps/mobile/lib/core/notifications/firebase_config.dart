import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Firebase's client identifiers are injected at build time. They are not secrets, but
/// keeping production project identity out of local builds means contributors can run
/// the app without a Firebase project or platform configuration files.
class LoczFirebaseConfig {
  const LoczFirebaseConfig._();

  static const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const _senderId = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const _storageBucket = String.fromEnvironment('FIREBASE_STORAGE_BUCKET');

  static bool get isConfigured =>
      _apiKey.isNotEmpty && _appId.isNotEmpty && _senderId.isNotEmpty && _projectId.isNotEmpty;

  static FirebaseOptions? get currentPlatform {
    if (!isConfigured || (!Platform.isAndroid && !Platform.isIOS)) return null;

    return FirebaseOptions(
      apiKey: _apiKey,
      appId: _appId,
      messagingSenderId: _senderId,
      projectId: _projectId,
      storageBucket: _storageBucket.isEmpty ? null : _storageBucket,
      iosBundleId: Platform.isIOS ? 'com.locz.app' : null,
    );
  }

  static Future<bool> initialise() async {
    final options = currentPlatform;
    if (options == null) {
      if (kDebugMode) {
        debugPrint(
          'Firebase disabled: no complete FIREBASE_* build configuration.',
        );
      }
      return false;
    }

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: options);
      }
      return true;
    } on FirebaseException catch (error) {
      // Push is an enhancement, not a startup dependency. A bad environment should be
      // visible during development without making the rest of LocZ unusable.
      if (kDebugMode) {
        debugPrint('Firebase initialization failed: ${error.code}');
      }
      return false;
    }
  }
}
