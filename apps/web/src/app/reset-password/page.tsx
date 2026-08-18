import type { Metadata } from 'next';
import { getMessageGroup, getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getLocale } from '@/lib/session';
import { AuthShell } from '../signin/auth-shell';
import { CompleteResetForm, ExpiredLink, RequestResetForm, type ResetLabels } from './reset-forms';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: getTranslator(locale)('passwordReset.requestTitle'),
    // A page reached from a link in an email, carrying a credential in the URL. Nothing about
    // it belongs in an index.
    robots: { index: false, follow: false },
  };
}

/**
 * Resetting a forgotten password.
 *
 * The API has implemented this from the start — hashed tokens, enumeration-safe responses, a
 * one-hour expiry, every session revoked on completion — and the emailed link pointed at this
 * path, which did not exist. A person who forgot their password had no route back into their
 * account, their listings or their conversations.
 *
 * One route serves both halves. Without a token it asks for the address; with one it checks
 * whether the link is still usable before showing a password field, so somebody who waited too
 * long is told before they type rather than after.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, locale] = await Promise.all([searchParams, getLocale()]);
  const t = getTranslator(locale);
  const labels = getMessageGroup(locale, 'passwordReset') as unknown as ResetLabels;

  const shellLabels = {
    eyebrow: t('auth.pageEyebrow'),
    title: t('auth.pageTitle'),
    subtitle: t('auth.pageSubtitle'),
    messageTitle: t('auth.benefitMessageTitle'),
    messageText: t('auth.benefitMessageText'),
    saveTitle: t('auth.benefitSaveTitle'),
    saveText: t('auth.benefitSaveText'),
    postTitle: t('auth.benefitPostTitle'),
    postText: t('auth.benefitPostText'),
    brand: t('brand.name'),
    secureAccess: t('auth.secureAccess'),
    privacy: t('auth.privacyNote'),
  };

  if (!token) {
    return (
      <AuthShell labels={shellLabels} mode="signin">
        <RequestResetForm labels={labels} />
      </AuthShell>
    );
  }

  // Checked before the form renders, so an expired link is answered with an explanation and a
  // way forward rather than with a password field that will refuse the submission.
  const check = await apiSafe<{ usable: boolean }>('/auth/password/reset/check', {
    method: 'POST',
    body: { token },
  });

  return (
    <AuthShell labels={shellLabels} mode="signin">
      {check?.usable ? (
        <CompleteResetForm token={token} labels={labels} />
      ) : (
        <ExpiredLink labels={labels} />
      )}
    </AuthShell>
  );
}
