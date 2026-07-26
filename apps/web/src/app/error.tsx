'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getTranslator, isLocale, type Locale } from '@/i18n';
import { reportClientError } from '@/lib/client-observability';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>('en');
  const t = getTranslator(locale);

  useEffect(() => {
    const pageLocale = document.documentElement.lang;
    if (isLocale(pageLocale)) queueMicrotask(() => setLocale(pageLocale));
  }, []);
  useEffect(() => reportClientError(error, 'error_boundary'), [error]);

  return (
    <section className="container" style={{ paddingBlock: '80px', textAlign: 'center' }}>
      <p className="eyebrow">{t('errorPage.kicker')}</p>
      <h1>{t('errorPage.title')}</h1>
      <p style={{ maxWidth: 520, margin: '12px auto 28px', color: 'var(--locz-muted)' }}>
        {t('errorPage.body')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="button button--primary" type="button" onClick={reset}>
          {t('errorPage.tryAgain')}
        </button>
        <Link className="button button--secondary" href="/">
          {t('errorPage.goHome')}
        </Link>
      </div>
      {error.digest ? (
        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--locz-muted)' }}>
          {t('errorPage.reference', { digest: error.digest })}
        </p>
      ) : null}
    </section>
  );
}
