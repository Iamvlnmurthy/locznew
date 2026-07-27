import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMessageGroup } from '@/i18n';
import { getCurrentUser, getLocale } from '@/lib/session';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create your LocZ account',
  // Nothing here is worth indexing, and a sign-up form in search results attracts bots
  // rather than buyers.
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);

  // Somebody already signed in has no business on a sign-up form; sending them home is
  // kinder than showing a page that would fail on submit.
  if (user) redirect('/');

  const s = getMessageGroup(locale, 'register');

  return (
    <main className="signin-page">
      <div className="container signin-page__inner signin-page__inner--single">
        <section className="signin-panel">
          <RegisterForm
            labels={{
              title: s.title,
              subtitle: s.subtitle,
              name: s.name,
              nameHint: s.nameHint,
              phone: s.phone,
              phoneHint: s.phoneHint,
              password: s.password,
              passwordHint: s.passwordHint,
              confirmPassword: s.confirmPassword,
              submit: s.submit,
              submitting: s.submitting,
              haveAccount: s.haveAccount,
              signIn: s.signIn,
              invalidName: s.invalidName,
              invalidPhone: s.invalidPhone,
              shortPassword: s.shortPassword,
              passwordMismatch: s.passwordMismatch,
              phoneTaken: s.phoneTaken,
              error: s.error,
            }}
          />
        </section>
      </div>
    </main>
  );
}
