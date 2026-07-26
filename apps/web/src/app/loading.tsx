import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export default async function Loading() {
  const t = getTranslator(await getLocale());

  return (
    <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="container route-loading__canvas" aria-hidden="true">
        <div className="route-loading__intro">
          <i />
          <b />
          <span />
        </div>
        <div className="route-loading__chips">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="route-loading__content">
          <aside>
            <i />
            <span />
            <span />
            <span />
          </aside>
          <section>
            <div className="route-loading__line" />
            <div className="route-loading__cards">
              <article />
              <article />
              <article />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
