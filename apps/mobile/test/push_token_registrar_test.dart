import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/notifications/push_token_registrar.dart';

void main() {
  test('defers a Firebase token until session restoration signs the user in', () async {
    final registered = <String>[];
    final registrar = PushTokenRegistrar((token) async {
      registered.add(token);
      return true;
    });

    await registrar.receiveToken('token-one');
    expect(registered, isEmpty);

    await registrar.setSignedIn(true);
    expect(registered, ['token-one']);
  });

  test('does not submit the same token repeatedly in one signed-in session', () async {
    final registered = <String>[];
    final registrar = PushTokenRegistrar((token) async {
      registered.add(token);
      return true;
    });

    await registrar.setSignedIn(true);
    await registrar.receiveToken('token-one');
    await registrar.receiveToken('token-one');
    await registrar.retry();

    expect(registered, ['token-one']);
  });

  test('registers a rotated token and retries a failed API update', () async {
    var shouldSucceed = true;
    final registered = <String>[];
    final registrar = PushTokenRegistrar((token) async {
      registered.add(token);
      return shouldSucceed;
    });

    await registrar.setSignedIn(true);
    await registrar.receiveToken('token-one');
    await registrar.receiveToken('token-two');
    shouldSucceed = false;
    await registrar.receiveToken('token-three');
    shouldSucceed = true;
    await registrar.retry();

    expect(
      registered,
      ['token-one', 'token-two', 'token-three', 'token-three'],
    );
  });

  test(
    're-registers the installation after sign-out and a later sign-in',
    () async {
      final registered = <String>[];
      final registrar = PushTokenRegistrar((token) async {
        registered.add(token);
        return true;
      });

      await registrar.receiveToken('token-one');
      await registrar.setSignedIn(true);
      await registrar.setSignedIn(false);
      await registrar.setSignedIn(true);

      expect(registered, ['token-one', 'token-one']);
    },
  );
}
