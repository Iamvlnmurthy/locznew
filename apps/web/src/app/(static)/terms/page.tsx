import type { Metadata } from 'next';
import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return {
    title: t('termsPage.title'),
    description: t('termsPage.metadataDescription'),
    alternates: { canonical: '/terms' },
  };
}

export default async function TermsPage() {
  const t = getTranslator(await getLocale());
  return (
    <>
      <h1 className="page-title">{t('termsPage.title')}</h1>
      <p className="page-subtitle">{t('termsPage.updated')}</p>

      {/* Said plainly rather than buried: this is a developer's draft, and shipping it
          unreviewed would be a real legal exposure for whoever operates LocZ. */}
      <div className="alert alert--info">{t('termsPage.draftNotice')}</div>

      <h2>{t('termsPage.eligibilityTitle')}</h2>
      <p>{t('termsPage.eligibilityBody')}</p>

      <h2>{t('termsPage.allowedTitle')}</h2>
      <p>{t('termsPage.allowedBody')}</p>

      <h2>{t('termsPage.prohibitedTitle')}</h2>
      <p>{t('termsPage.prohibitedBody')}</p>

      <h2>{t('termsPage.platformTitle')}</h2>
      <p>{t('termsPage.platformBody')}</p>

      <h2>{t('termsPage.moderationTitle')}</h2>
      <p>{t('termsPage.moderationBody')}</p>

      <h2>{t('termsPage.contentTitle')}</h2>
      <p>{t('termsPage.contentBody')}</p>

      <h2>{t('termsPage.endingTitle')}</h2>
      <p>{t('termsPage.endingBody')}</p>
    </>
  );
}
