import type { Metadata } from 'next';
import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return {
    title: t('privacyPage.title'),
    description: t('privacyPage.metadataDescription'),
    alternates: { canonical: '/privacy' },
  };
}

export default async function PrivacyPage() {
  const t = getTranslator(await getLocale());
  return (
    <>
      <h1 className="page-title">{t('privacyPage.title')}</h1>
      <p className="page-subtitle">{t('privacyPage.updated')}</p>

      <div className="alert alert--info">{t('privacyPage.draftNotice')}</div>

      <h2>{t('privacyPage.collectTitle')}</h2>
      <ul>
        <li>
          <strong>{t('privacyPage.mobileTitle')}</strong> — {t('privacyPage.mobileBody')}
        </li>
        <li>
          <strong>{t('privacyPage.postsTitle')}</strong> — {t('privacyPage.postsBody')}
        </li>
        <li>
          <strong>{t('privacyPage.locationTitle')}</strong> — {t('privacyPage.locationBody')}
        </li>
        <li>
          <strong>{t('privacyPage.deviceTitle')}</strong> — {t('privacyPage.deviceBody')}
        </li>
      </ul>

      <h2>{t('privacyPage.notDoTitle')}</h2>
      <p>{t('privacyPage.notDoBody')}</p>

      <h2>{t('privacyPage.visibilityTitle')}</h2>
      <p>{t('privacyPage.visibilityBody')}</p>

      <h2>{t('privacyPage.retentionTitle')}</h2>
      <p>{t('privacyPage.retentionBody')}</p>

      <h2>{t('privacyPage.choicesTitle')}</h2>
      <ul>
        <li>{t('privacyPage.choiceEdit')}</li>
        <li>{t('privacyPage.choiceNotifications')}</li>
        <li>{t('privacyPage.choiceSignOut')}</li>
        <li>{t('privacyPage.choiceDeactivate')}</li>
        <li>{t('privacyPage.choiceDelete')}</li>
      </ul>

      <h2>{t('privacyPage.contactTitle')}</h2>
      <p>
        {t('privacyPage.contactBody')} <a href="mailto:privacy@locz.in">privacy@locz.in</a>.
      </p>
    </>
  );
}
