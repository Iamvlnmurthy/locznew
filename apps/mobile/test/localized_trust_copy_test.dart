import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/i18n/strings.dart';

void main() {
  test('supported locales own every high-trust and posting translation', () {
    const requiredKeys = [
      'location.soon',
      'location.loadError',
      'location.noCities',
      'location.noMatches',
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
      'post.editTitle',
      'post.editSubtitle',
      'post.saveChanges',
      'post.savingChanges',
      'post.updateSuccess',
      'post.moderationWarning',
      'post.removedCannotEdit',
      'post.saveDraft',
      'post.draftSaved',
      'post.preview',
      'post.previewTitle',
      'post.previewUntitled',
      'post.previewNoDescription',
      'post.contactPrivacy',
      'post.restoreTitle',
      'post.restoreBody',
      'post.restoreProgress',
      'post.discardProgress',
      'account.actionPause',
      'account.actionResume',
      'account.actionSold',
      'account.actionRepublish',
      'account.actionDelete',
      'account.actionEdit',
      'account.actionResumeDraft',
      'account.deleteTitle',
      'account.deleteConfirm',
      'listing.whatsApp',
      'listing.shareText',
      'search.recentSearches',
      'search.clearRecent',
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
