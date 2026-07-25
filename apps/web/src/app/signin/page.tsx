import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n';
import { getCurrentUser, getLocale } from '@/lib/session';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next }, locale, user] = await Promise.all([searchParams, getLocale(), getCurrentUser()]);

  // Already signed in — no reason to show the form again.
  if (user) redirect(next && next.startsWith('/') ? next : '/');

  const t = getTranslator(locale);

  return (
    <div className="container">
      <SignInForm
        next={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'}
        labels={{
          signInTitle: t('auth.signInTitle'),
          signInSubtitle: t('auth.signInSubtitle'),
          phone: t('auth.phone'),
          phoneHint: t('auth.phoneHint'),
          sendCode: t('auth.sendCode'),
          sending: t('auth.sending'),
          codeTitle: t('auth.codeTitle'),
          codeSentTo: t('auth.codeSentTo'),
          code: t('auth.code'),
          verify: t('auth.verify'),
          verifying: t('auth.verifying'),
          changeNumber: t('auth.changeNumber'),
          invalidPhone: t('auth.invalidPhone'),
          devCodeNotice: t('auth.devCodeNotice'),
        }}
      />
    </div>
  );
}
