import { LoczLoader } from '@/components/locz-loader';
import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export default async function Loading() {
  const t = getTranslator(await getLocale());
  const label = t('common.loading');
  return (
    <section className="locz-route-loading" aria-label={label}>
      <LoczLoader label={label} />
      <div className="locz-route-loading__skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
