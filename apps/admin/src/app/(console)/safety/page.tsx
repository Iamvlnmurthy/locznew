import Link from 'next/link';
import { ApiRequestError, api } from '@/lib/api';
import type { SafetyCaseSummary, SafetyCaseStatus } from '@/lib/safety-types';
import { ConsoleIcon } from '../console-icon';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<SafetyCaseStatus, string> = {
  OPEN: 'Needs action',
  REPORTED: 'Reported',
  RELEASED: 'Released',
  CLOSED: 'Closed',
};

function ageLabel(openedAt: string): string {
  const elapsedHours = Math.max(0, (Date.now() - new Date(openedAt).getTime()) / 3_600_000);
  if (elapsedHours < 1) return 'Opened less than an hour ago';
  if (elapsedHours < 24) return `Open for ${Math.floor(elapsedHours)} hours`;
  const days = Math.floor(elapsedHours / 24);
  return `Open for ${days} day${days === 1 ? '' : 's'}`;
}

export default async function SafetyCasesPage() {
  let cases: SafetyCaseSummary[];
  try {
    cases = await api<SafetyCaseSummary[]>('/moderation/safety/cases');
  } catch (error) {
    return (
      <>
        <div className="page-header">
          <div>
            <span className="eyebrow">Restricted workspace</span>
            <h1>Safety cases</h1>
          </div>
        </div>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError
            ? error.message
            : 'Could not load restricted cases. Check the API connection.'}
        </div>
      </>
    );
  }

  const openCount = cases.filter((item) => item.status === 'OPEN').length;
  const reportedCount = cases.filter((item) => item.status === 'REPORTED').length;

  return (
    <div className="safety-workspace">
      <header className="safety-hero">
        <div className="safety-hero__mark" aria-hidden="true">
          <ConsoleIcon name="shield" size={24} />
        </div>
        <div className="safety-hero__copy">
          <span className="eyebrow">Restricted workspace</span>
          <h1>Safety cases</h1>
          <p>
            Start with metadata. Evidence remains concealed unless a named officer records why
            viewing it is necessary.
          </p>
        </div>
        <div className="safety-hero__counts" aria-label="Active case counts">
          <span>
            <strong>{openCount}</strong>
            Need action
          </span>
          <span>
            <strong>{reportedCount}</strong>
            Reported
          </span>
        </div>
      </header>

      <div className="safety-boundary-note">
        <span className="status-dot" aria-hidden="true" />
        <p>Images never load on this page. Case views and every lifecycle action are recorded.</p>
      </div>

      {cases.length === 0 ? (
        <section className="card safety-empty">
          <span className="safety-empty__icon" aria-hidden="true">
            <ConsoleIcon name="shield" size={25} />
          </span>
          <h2>No active cases</h2>
          <p>There is nothing waiting for a child-safety officer right now.</p>
        </section>
      ) : (
        <section className="safety-queue" aria-label="Active safety cases">
          <div className="safety-queue__heading">
            <div>
              <span className="panel__kicker">Active queue</span>
              <h2>Oldest cases first</h2>
            </div>
            <span>{cases.length} active</span>
          </div>
          <div className="safety-case-list">
            {cases.map((item) => (
              <Link href={`/safety/${item.id}`} className="safety-case-row" key={item.id}>
                <span className={`safety-status safety-status--${item.status.toLowerCase()}`}>
                  {STATUS_LABELS[item.status]}
                </span>
                <span className="safety-case-row__main">
                  <strong>{item.reasonCode.replaceAll('_', ' ').toLowerCase()}</strong>
                  <small>{ageLabel(item.openedAt)}</small>
                </span>
                <span className="safety-case-row__ids">
                  <small>Case</small>
                  <code>{item.id.slice(0, 8)}</code>
                </span>
                <span className="safety-case-row__arrow" aria-hidden="true">
                  <ConsoleIcon name="arrow" size={17} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
