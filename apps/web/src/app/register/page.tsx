import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { City } from '@locz/shared-types';
import { getMessageGroup } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { AuthShell } from '../signin/auth-shell';
import { RegisterForm } from './register-form';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: getMessageGroup(locale, 'register').title,
    // Nothing here is worth indexing, and a sign-up form in search results attracts bots
    // rather than buyers.
    robots: { index: false, follow: false },
  };
}

export default async function RegisterPage() {
  const [locale, user, cities] = await Promise.all([
    getLocale(),
    getCurrentUser(),
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
  ]);

  // Somebody already signed in has no business on a sign-up form; sending them home is
  // kinder than showing a page that would fail on submit.
  if (user) redirect('/');

  const s = getMessageGroup(locale, 'register');
  const a = getMessageGroup(locale, 'auth');
  const b = getMessageGroup(locale, 'brand');

  return (
    <AuthShell
      mode="register"
      labels={{
        eyebrow: a.pageEyebrow,
        title: a.pageTitle,
        subtitle: a.pageSubtitle,
        messageTitle: a.benefitMessageTitle,
        messageText: a.benefitMessageText,
        saveTitle: a.benefitSaveTitle,
        saveText: a.benefitSaveText,
        postTitle: a.benefitPostTitle,
        postText: a.benefitPostText,
        brand: b.name,
        secureAccess: a.secureAccess,
        privacy: a.privacyNote,
      }}
    >
      <RegisterForm
        cities={cities ?? []}
        googleClientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}
        labels={{
          title: s.title,
          subtitle: s.subtitle,
          name: s.name,
          nameHint: s.nameHint,
          phone: s.phone,
          phoneIdentityHint: s.phoneIdentityHint,
          email: s.email,
          emailHint: s.emailHint,
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
          showPassword: s.showPassword,
          hidePassword: s.hidePassword,
          googleDivider: a.googleDivider,
          googleButton: a.googleButton,
          googleUnavailable: a.googleUnavailable,
          googleFailed: a.googleFailed,
        }}
      />
    </AuthShell>
  );
}
