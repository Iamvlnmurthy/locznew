import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Whether a device lock is available, and if not, why.
///
/// The distinction matters for what the interface should say. A phone with no screen lock
/// configured is a setup problem the user can fix; a phone whose hardware cannot do it is
/// not. Telling someone to "enable biometrics" on a device that has none is the kind of
/// advice that makes people distrust an app.
enum DeviceLockAvailability {
  /// A fingerprint, face or iris enrolment is ready to use.
  biometric,

  /// No biometric enrolled, but the screen lock (PIN, pattern or password) can be used.
  deviceCredential,

  /// The device has a lock screen but nothing is enrolled — the user can fix this.
  notEnrolled,

  /// The hardware or platform cannot do it at all.
  unsupported,
}

/// The phone's own lock, used to gate a signed-in session.
///
/// This is a *local* check and deliberately not a login. Signing in still means a phone
/// number and a code; this only decides whether an already-authenticated session on this
/// device may be resumed without re-entering anything. That distinction is worth keeping
/// clear: the server never sees the result, so a compromised app could skip it. What it
/// genuinely protects against is the realistic threat — someone picking up an unlocked
/// phone and reading the owner's chats or posting as them.
///
/// It is opt-in. Turning it on for everybody would lock out the share of users who have no
/// screen lock configured at all, which in India is not a small number.
class DeviceLock {
  DeviceLock({LocalAuthentication? auth, SharedPreferences? preferences})
      : _auth = auth ?? LocalAuthentication(),
        _preferences = preferences;

  static const _enabledKey = 'security.device_lock.enabled';

  final LocalAuthentication _auth;
  SharedPreferences? _preferences;

  Future<SharedPreferences> get _prefs async =>
      _preferences ??= await SharedPreferences.getInstance();

  /// What this device can actually do, asked once so the interface can be honest about it.
  Future<DeviceLockAvailability> availability() async {
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) return DeviceLockAvailability.unsupported;

      final biometrics = await _auth.getAvailableBiometrics();
      if (biometrics.isNotEmpty) return DeviceLockAvailability.biometric;

      // `canCheckBiometrics` is false while the screen lock still exists, which is the
      // common case on budget phones: a PIN but no fingerprint reader.
      final canCheck = await _auth.canCheckBiometrics;
      return canCheck
          ? DeviceLockAvailability.notEnrolled
          : DeviceLockAvailability.deviceCredential;
    } on PlatformException {
      // A platform that cannot answer the question cannot enforce the lock either.
      return DeviceLockAvailability.unsupported;
    }
  }

  /// Whether the user has asked for their session to be gated.
  Future<bool> isEnabled() async => (await _prefs).getBool(_enabledKey) ?? false;

  /// Turns the lock on only after the user has proved they can pass it.
  ///
  /// Enabling without a successful prompt is how people lock themselves out: a setting that
  /// says "on" and a device that cannot satisfy it leaves the app unopenable.
  Future<bool> enable() async {
    final passed = await authenticate(reason: 'Confirm it is you to turn on the device lock');
    if (passed) await (await _prefs).setBool(_enabledKey, true);
    return passed;
  }

  /// Turning it off also requires passing it, so a stranger holding the phone cannot.
  Future<bool> disable() async {
    final passed = await authenticate(reason: 'Confirm it is you to turn off the device lock');
    if (passed) await (await _prefs).setBool(_enabledKey, false);
    return passed;
  }

  /// Prompts the device lock and reports whether it was satisfied.
  ///
  /// `biometricOnly: false` deliberately allows the PIN, pattern or password as well. A
  /// fingerprint that stops working — wet hands, a cut finger — must not lock somebody out
  /// of their own account, and the screen lock is the same secret the phone already trusts.
  Future<bool> authenticate({required String reason}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
          useErrorDialogs: true,
        ),
      );
    } on PlatformException {
      // Cancelled, locked out after too many attempts, or unavailable. All of these mean
      // "not authenticated", and none of them should crash the app or silently let the user
      // through — the caller keeps the session gated.
      return false;
    }
  }

  /// Whether the session should be gated right now: enabled by the user, and satisfiable.
  ///
  /// Checking availability again rather than trusting the stored flag matters — someone can
  /// remove their screen lock in Android settings after enabling this, and an app that then
  /// demands an impossible unlock is bricked from the user's point of view.
  Future<bool> shouldChallenge() async {
    if (!await isEnabled()) return false;
    return await availability() != DeviceLockAvailability.unsupported;
  }
}
