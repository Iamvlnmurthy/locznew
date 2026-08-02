import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n';
import { getCurrentUser, getLocale } from '@/lib/session';
import { AuthShell } from './auth-shell';
import { PasswordSignInForm } from './password-sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: getTranslator(locale)('auth.signInTitleP'),
    robots: { index: false, follow: false },
  };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next }, locale, user] = await Promise.all([searchParams, getLocale(), getCurrentUser()]);

  if (user) redirect(next && next.startsWith('/') ? next : '/');

  const t = getTranslator(locale);
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

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

  return (
    <AuthShell labels={shellLabels} mode="signin">
      <PasswordSignInForm
        next={safeNext}
        googleClientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}
        labels={{
          title: t('auth.signInTitleP'),
          subtitle: t('auth.signInSubtitleP'),
          email: t('auth.email'),
          emailHint: t('auth.emailHint'),
          password: t('auth.passwordLabel'),
          submit: t('auth.submitP'),
          submitting: t('auth.submittingP'),
          invalidPhone: t('auth.invalidPhone'),
          missingPassword: t('auth.missingPassword'),
          badCredentials: t('auth.badCredentials'),
          error: t('auth.badCredentials'),
          newHere: t('register.newHere'),
          createOne: t('register.createOne'),
          showPassword: t('auth.showPassword'),
          hidePassword: t('auth.hidePassword'),
          googleDivider: t('auth.googleDivider'),
          googleButton: t('auth.googleButton'),
          googleUnavailable: t('auth.googleUnavailable'),
          googleFailed: t('auth.googleFailed'),
        }}
      />
    </AuthShell>
  );
}
