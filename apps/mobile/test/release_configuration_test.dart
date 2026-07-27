import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/config/env.dart';

/// The guard that stops a store build shipping a development endpoint.
///
/// `Env` is entirely compile-time constants, so a test binary sees the *default*
/// configuration — the one a release build would inherit if somebody forgot the
/// `--dart-define` flags. That makes this the exact case worth asserting: the defaults must
/// be recognised as unsafe, because the whole guard rests on that judgement being right.
///
/// The throw itself cannot be exercised here. `kReleaseMode` is a compile-time constant and
/// is false under `flutter test`, so `assertReleaseConfiguration` returns early by design.
/// What is testable is the decision it makes, and that is what these cover.
void main() {
  group('release configuration', () {
    test('the development defaults are not safe to ship', () {
      // If this ever passes, either the defaults became production URLs — in which case a
      // developer running the app now talks to the live API by accident — or the check was
      // loosened until it stopped meaning anything.
      expect(Env.isReleaseSafe, isFalse);
    });

    test('the default API base URL is the emulator loopback over plain HTTP', () {
      expect(Env.apiBaseUrl, startsWith('http://'));
      expect(Env.apiBaseUrl, contains('10.0.2.2'));
    });

    test('a development build is left alone rather than crashed', () {
      // Under test and in debug, kReleaseMode is false and the guard must do nothing at all,
      // however unsafe the configuration looks. A guard that fires during development would
      // be removed within a day, and then it would not be there for the build that matters.
      expect(Env.assertReleaseConfiguration, returnsNormally);
    });

    test('the public site URL is already HTTPS', () {
      // Shared listing links go into messages and Android App Links verification; an http://
      // link here would break verification and downgrade every share.
      expect(Env.siteUrl, startsWith('https://'));
    });
  });
}
