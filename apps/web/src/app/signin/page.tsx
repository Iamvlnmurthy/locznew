import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icons';
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

  if (user) redirect(next && next.startsWith('/') ? next : '/');

  const t = getTranslator(locale);
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  return (
    <main className="signin-page">
      <div className="container signin-page__inner">
        <section className="signin-story">
          <span className="eyebrow">
            <i /> {t('auth.pageEyebrow')}
          </span>
          <h1>{t('auth.pageTitle')}</h1>
          <p>{t('auth.pageSubtitle')}</p>

          <div className="signin-story__benefits">
            <div>
              <span>
                <Icon name="message" width="20" height="20" />
              </span>
              <div>
                <strong>{t('auth.benefitMessageTitle')}</strong>
                <small>{t('auth.benefitMessageText')}</small>
              </div>
            </div>
            <div>
              <span>
                <Icon name="heart" width="20" height="20" />
              </span>
              <div>
                <strong>{t('auth.benefitSaveTitle')}</strong>
                <small>{t('auth.benefitSaveText')}</small>
              </div>
            </div>
            <div>
              <span>
                <Icon name="plus" width="20" height="20" />
              </span>
              <div>
                <strong>{t('auth.benefitPostTitle')}</strong>
                <small>{t('auth.benefitPostText')}</small>
              </div>
            </div>
          </div>

          <div className="signin-story__art" aria-hidden="true">
            <Image
              src="/illustrations/hero-neighbourhood-mobile.webp"
              alt=""
              width="620"
              height="620"
              priority
            />
          </div>
        </section>

        <section className="signin-panel">
          <div className="signin-panel__brand">
            <Image src="/brand/locz-mark.png" alt="" width="38" height="38" />
            <span>
              <strong>{t('brand.name')}</strong>
              <small>{t('auth.secureAccess')}</small>
            </span>
          </div>

          <SignInForm
            next={safeNext}
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
              name: t('auth.name'),
              nameHint: t('auth.nameHint'),
              optional: t('auth.optional'),
              codeHint: t('auth.codeHint'),
              noPassword: t('auth.noPassword'),
              accountNote: t('auth.accountNote'),
              newHere: t('register.newHere'),
              createOne: t('register.createOne'),
              privacyNote: t('auth.privacyNote'),
              resend: t('auth.resend'),
            }}
          />

          <div className="signin-panel__trust">
            <Icon name="shield" width="15" height="15" />
            <span>{t('auth.privacyNote')}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
