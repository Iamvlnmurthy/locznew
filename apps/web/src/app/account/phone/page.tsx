import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n';
import { getCurrentUser, getLocale } from '@/lib/session';
import { VerifyPhoneForm } from './verify-phone-form';

/**
 * Confirming a mobile number, for somebody who already has an account.
 *
 * Separate from sign-up on purpose. A confirmed number is what lets a person claim a business
 * and what tells a buyer the seller can be reached, but requiring it to register would put an
 * SMS between somebody and their first listing.
 */
export default async function VerifyPhonePage() {
  // Confirming a number belongs to an account, so there has to be one. Signed out, the API
  // would refuse anyway — sending somebody through an SMS first would be a waste of a message.
  const user = await getCurrentUser();
  if (!user) redirect('/signin?next=/account/phone');

  const t = getTranslator(await getLocale());

  return (
    <main className="auth-page">
      <VerifyPhoneForm
        labels={{
          title: t('verifyPhone.title'),
          intro: t('verifyPhone.intro'),
          phone: t('verifyPhone.phone'),
          phoneHint: t('verifyPhone.phoneHint'),
          send: t('verifyPhone.send'),
          code: t('verifyPhone.code'),
          codeHint: t('verifyPhone.codeHint'),
          confirm: t('verifyPhone.confirm'),
          resend: t('verifyPhone.resend'),
          confirmed: t('verifyPhone.confirmed'),
          unavailable: t('verifyPhone.unavailable'),
          invalidPhone: t('verifyPhone.invalidPhone'),
          invalidCode: t('verifyPhone.invalidCode'),
          tooManyAttempts: t('verifyPhone.tooManyAttempts'),
          alreadyTaken: t('verifyPhone.alreadyTaken'),
          failed: t('verifyPhone.failed'),
        }}
      />
    </main>
  );
}
