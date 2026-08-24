import Link from 'next/link';
import { DEFAULT_LOCALE, getTranslator } from '@/i18n';

/**
 * The framework prerenders this special page without a request context during `next build`.
 * Keep it deterministic: reading headers or cookies here breaks Linux/VPS prerendering and can
 * leave the deployment with an incomplete `.next` directory. English is the canonical fallback;
 * localized, route-specific 404 experiences can be added outside this special-page boundary.
 */
export default function NotFound() {
  const t = getTranslator(DEFAULT_LOCALE);
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
