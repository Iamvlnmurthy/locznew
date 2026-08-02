import { redirect } from 'next/navigation';
import { getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { ProfileForm } from './profile-form';

interface Profile {
  displayName: string;
  email: string | null;
  bio: string | null;
  phoneE164: string | null;
  phoneVerifiedAt: string | null;
}

/**
 * Your own details.
 *
 * The app had no way to see or change them: the name shown to every buyer you talk to was
 * fixed at sign-up, and the address you sign in with could not be corrected after a typo.
 */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin?next=/account/profile');

  const t = getTranslator(await getLocale());
  const profile = await apiSafe<Profile>('/users/me', { auth: true });

  return (
    <main className="auth-page">
      <h1>{t('profile.title')}</h1>
      <p>{t('profile.intro')}</p>

      <ProfileForm
        current={{
          displayName: profile?.displayName ?? user.displayName,
          email: profile?.email ?? null,
          bio: profile?.bio ?? null,
        }}
        labels={{
          name: t('profile.name'),
          nameHint: t('profile.nameHint'),
          email: t('profile.email'),
          emailHint: t('profile.emailHint'),
          bio: t('profile.bio'),
          bioHint: t('profile.bioHint'),
          save: t('profile.save'),
          saved: t('profile.saved'),
          invalidName: t('profile.invalidName'),
          invalidEmail: t('profile.invalidEmail'),
          emailTaken: t('profile.emailTaken'),
          failed: t('profile.failed'),
        }}
      />

      {/* The number is changed by verifying a new one, never by typing over the old one. */}
      <section className="field">
        <h2>{t('profile.phoneTitle')}</h2>
        <p>
          {profile?.phoneE164 ?? '—'}
          {profile?.phoneVerifiedAt ? ` · ${t('profile.phoneConfirmed')}` : ''}
        </p>
        <a href="/account/phone">{t('profile.phoneAction')}</a>
      </section>
    </main>
  );
}
