import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return {
    title: t('aboutPage.title'),
    description: t('aboutPage.metadataDescription'),
    alternates: { canonical: '/about' },
  };
}

export default async function AboutPage() {
  const t = getTranslator(await getLocale());
  return (
    <>
      <h1 className="page-title">{t('aboutPage.title')}</h1>
      <p className="page-subtitle info-card__lede">{t('aboutPage.tagline')}</p>

      <p>{t('aboutPage.intro')}</p>

      <h2>{t('aboutPage.freeTitle')}</h2>
      <p>{t('aboutPage.freeBody')}</p>

      <h2>{t('aboutPage.localTitle')}</h2>
      <p>{t('aboutPage.localBody')}</p>

      <h2>{t('aboutPage.languageTitle')}</h2>
      <p>{t('aboutPage.languageBody')}</p>

      <h2>{t('aboutPage.cleanTitle')}</h2>
      <p>
        {t('aboutPage.cleanBody')} <Link href="/safety">{t('aboutPage.safetyLink')}</Link>.
      </p>
    </>
  );
}
