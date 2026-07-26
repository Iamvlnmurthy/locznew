import Link from 'next/link';
import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export default async function NotFound() {
  const t = getTranslator(await getLocale());
  return (
    <div className="container not-found">
      <img src="/illustrations/empty-neighbourhood.webp" alt="" width="420" height="340" />
      <span className="section-kicker">{t('notFoundPage.kicker')}</span>
      <h1>{t('notFoundPage.title')}</h1>
      <p>{t('notFoundPage.body')}</p>
      <Link href="/" className="btn btn--primary">
        {t('notFoundPage.back')}
      </Link>
    </div>
  );
}
