import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/i18n/strings.dart';

void main() {
  test('supported locales own every high-trust and posting translation', () {
    const requiredKeys = [
      'location.soon',
      'post.fieldCondition',
      'post.conditionNew',
      'post.conditionLikeNew',
      'post.conditionGood',
      'post.conditionFair',
      'post.conditionParts',
      'post.contactPreference',
      'post.contactMessages',
      'post.contactPhoneAndMessages',
      'post.contactPhone',
      'notifications.markAllRead',
      'notifications.empty',
      'notifications.signInTitle',
      'notifications.signInHint',
      'update.available',
      'update.action',
      'update.dismiss',
      'deviceLock.title',
      'deviceLock.checking',
      'deviceLock.require',
      'deviceLock.biometric',
      'deviceLock.credential',
      'deviceLock.notEnrolled',
      'deviceLock.unsupported',
      'deviceLock.notChanged',
      'deviceLock.locked',
      'deviceLock.unlockHint',
      'deviceLock.unlock',
    ];

    for (final locale in AppLocaleOption.values) {
      final strings = Strings(locale);
      for (final key in requiredKeys) {
        expect(
          strings.hasOwnTranslation(key),
          isTrue,
          reason: '${locale.name} must translate $key instead of falling back to English',
        );
      }
    }
  });
}
