import type { Metadata } from 'next';
import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return {
    title: t('safetyPage.metadataTitle'),
    description: t('safetyPage.metadataDescription'),
    alternates: { canonical: '/safety' },
  };
}

/**
 * The safety page earns its place: the advice here is what actually prevents the fraud
 * the moderation rules are built around. It is written as habits, not warnings.
 */
export default async function SafetyPage() {
  const t = getTranslator(await getLocale());
  return (
    <>
      <h1 className="page-title">{t('safetyPage.title')}</h1>
      <p className="page-subtitle">{t('safetyPage.subtitle')}</p>

      <h2>{t('safetyPage.advanceTitle')}</h2>
      <p>{t('safetyPage.advanceBody')}</p>

      <h2>{t('safetyPage.publicTitle')}</h2>
      <p>{t('safetyPage.publicBody')}</p>

      <h2>{t('safetyPage.inspectTitle')}</h2>
      <p>{t('safetyPage.inspectBody')}</p>

      <h2>{t('safetyPage.privateTitle')}</h2>
      <p>{t('safetyPage.privateBody')}</p>

      <h2>{t('safetyPage.linksTitle')}</h2>
      <p>{t('safetyPage.linksBody')}</p>

      <h2>{t('safetyPage.reportTitle')}</h2>
      <p>{t('safetyPage.reportBody')}</p>
    </>
  );
}
