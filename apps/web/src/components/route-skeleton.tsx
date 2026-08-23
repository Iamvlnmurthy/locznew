import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

/**
 * The route skeleton.
 *
 * This was `app/loading.tsx`, which Next treats as a route convention: it wraps every page in
 * a Suspense boundary and flushes this markup before the page has resolved. Two consequences,
 * neither of them wanted.
 *
 * Once any HTML is flushed the response status is locked, so `notFound()` could no longer set
 * 404 — every unknown business, listing and category URL answered 200 with a "not found" body.
 * Search Console counts those as soft 404s, and there are 3.4 million business URLs to get
 * wrong.
 *
 * It also flashed on every navigation. That was worth it when a page took 3.9 seconds; a page
 * now takes about 0.3, and a skeleton that appears and vanishes inside a third of a second
 * reads as a glitch rather than as progress.
 *
 * Kept as an ordinary component so a genuinely slow section can still wrap itself in
 * <Suspense fallback={<RouteSkeleton />}> — inside the page, after the data has been checked,
 * where it cannot pre-empt the status code.
 */
export default async function RouteSkeleton() {
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
