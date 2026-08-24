import { LoczLoader } from '@/components/locz-loader';

export default function Loading() {
  return (
    <section className="locz-route-loading" aria-label="Loading">
      <LoczLoader label="Loading…" />
      <div className="locz-route-loading__skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
