import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n';
import { getCurrentUser, getLocale } from '@/lib/session';
import { AuthShell } from '../../signin/auth-shell';
import { VerifyPhoneForm } from './verify-phone-form';

/**
 * Confirming a mobile number, for somebody who already has an account.
 *
 * Separate from sign-up on purpose. A confirmed number is what lets a person claim a business
 * and what tells a buyer the seller can be reached, but requiring it to register would put an
 * SMS between somebody and their first listing.
 */
export default async function VerifyPhonePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Confirming a number belongs to an account, so there has to be one. Signed out, the API
  // would refuse anyway — sending somebody through an SMS first would be a waste of a message.
  const user = await getCurrentUser();
  if (!user) redirect('/signin?next=/account/phone');

  const t = getTranslator(await getLocale());

  // Google sign-up sends people here with where they were going attached. Only same-origin
  // paths are honoured, so `?next=` cannot be turned into an open redirect.
  const requested = (await searchParams).next ?? '/';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';

  return (
    <AuthShell
      mode="verify"
      labels={{
        eyebrow: t('auth.pageEyebrow'),
        title: t('verifyPhone.title'),
        subtitle: t('verifyPhone.intro'),
        messageTitle: t('auth.benefitMessageTitle'),
        messageText: t('auth.benefitMessageText'),
        saveTitle: t('auth.benefitSaveTitle'),
        saveText: t('auth.benefitSaveText'),
        postTitle: t('auth.benefitPostTitle'),
        postText: t('auth.benefitPostText'),
        brand: t('brand.name'),
        secureAccess: t('auth.secureAccess'),
        privacy: t('auth.privacyNote'),
      }}
    >
      <VerifyPhoneForm
        next={next}
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
          continue: t('verifyPhone.continue'),
          skip: t('verifyPhone.skip'),
          skipHint: t('verifyPhone.skipHint'),
        }}
      />
    </AuthShell>
  );
}
