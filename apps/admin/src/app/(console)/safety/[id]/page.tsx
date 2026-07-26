import Link from 'next/link';
import { ApiRequestError, api } from '@/lib/api';
import type {
  SafetyAccessAction,
  SafetyAccessEvent,
  SafetyCaseDetail,
  SafetyCaseStatus,
} from '@/lib/safety-types';
import { getCurrentUser, hasPermission } from '@/lib/session';
import { ConsoleIcon } from '../../console-icon';
import { CaseActions } from './case-actions';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<SafetyCaseStatus, string> = {
  OPEN: 'Needs action',
  REPORTED: 'Reported',
  RELEASED: 'Released',
  CLOSED: 'Closed',
};

const ACTION_LABELS: Record<SafetyAccessAction, string> = {
  CASE_VIEWED: 'Case metadata viewed',
  EVIDENCE_PREVIEW: 'Evidence preview requested',
  CASE_REPORTED: 'External report recorded',
  HOLD_RELEASED: 'Legal hold released',
  CASE_CLOSED: 'Case closed',
};

function formatDate(value: string | null): string {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function CaseFact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="safety-fact">
      <dt>{label}</dt>
      <dd className={mono ? 'safety-mono' : undefined}>{value}</dd>
    </div>
  );
}

function AccessEvent({ event }: { event: SafetyAccessEvent }) {
  return (
    <li className="safety-timeline__event">
      <span className="safety-timeline__dot" aria-hidden="true" />
      <div>
        <div className="safety-timeline__topline">
          <strong>{ACTION_LABELS[event.action]}</strong>
          <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
        </div>
        <p>{event.justification}</p>
        <code>Officer {event.actorId.slice(0, 8)}</code>
      </div>
    </li>
  );
}

export default async function SafetyCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  let detail: SafetyCaseDetail;
  try {
    detail = await api<SafetyCaseDetail>(`/moderation/safety/cases/${id}`);
  } catch (error) {
    return (
      <>
        <Link href="/safety" className="safety-back-link">
          ← Back to safety cases
        </Link>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError
            ? error.message
            : 'Could not load this restricted case.'}
        </div>
      </>
    );
  }

  return (
    <div className="safety-detail">
      <Link href="/safety" className="safety-back-link">
        ← Back to safety cases
      </Link>

      <header className="safety-detail__header">
        <div className="safety-detail__title">
          <span className="safety-detail__shield" aria-hidden="true">
            <ConsoleIcon name="shield" size={22} />
          </span>
          <div>
            <span className="eyebrow">Restricted case</span>
            <h1>Case {detail.id.slice(0, 8)}</h1>
            <p>Metadata first · evidence concealed · access audited</p>
          </div>
        </div>
        <span
          className={`safety-status safety-status--${detail.status.toLowerCase()}`}
          data-safety-status={detail.status}
        >
          {STATUS_LABELS[detail.status]}
        </span>
      </header>

      <div className="safety-detail__layout">
        <div className="safety-detail__content">
          <section className="panel safety-case-summary">
            <div className="panel__header">
              <div>
                <span className="panel__kicker">Case record</span>
                <h2>What we know without viewing the image</h2>
              </div>
              <span className="safety-no-image">
                <span aria-hidden="true">⊘</span> No image loaded
              </span>
            </div>

            <dl className="safety-facts">
              <CaseFact label="Reason" value={detail.reasonCode.replaceAll('_', ' ')} />
              <CaseFact label="Provider" value={detail.provider} />
              <CaseFact
                label="Provider reference"
                value={detail.providerReference ?? 'Not supplied'}
                mono={Boolean(detail.providerReference)}
              />
              <CaseFact
                label="Report acknowledgement"
                value={detail.reportReference ?? 'Not reported yet'}
                mono={Boolean(detail.reportReference)}
              />
              <CaseFact label="Media state" value={detail.mediaStatus.replaceAll('_', ' ')} />
              <CaseFact label="Listing ID" value={detail.listingId} mono />
            </dl>

            {detail.resolutionNote ? (
              <div className="safety-resolution">
                <span>Resolution note</span>
                <p>{detail.resolutionNote}</p>
              </div>
            ) : null}
          </section>

          <section className="panel safety-lifecycle">
            <div className="panel__header">
              <div>
                <span className="panel__kicker">Lifecycle</span>
                <h2>Case milestones</h2>
              </div>
            </div>
            <dl className="safety-milestones">
              <CaseFact label="Opened" value={formatDate(detail.openedAt)} />
              <CaseFact label="Reported" value={formatDate(detail.reportedAt)} />
              <CaseFact label="Released" value={formatDate(detail.releasedAt)} />
              <CaseFact label="Closed" value={formatDate(detail.closedAt)} />
            </dl>
          </section>

          <section className="panel safety-history">
            <div className="panel__header">
              <div>
                <span className="panel__kicker">Restricted audit trail</span>
                <h2>Access and decisions</h2>
              </div>
              <span className="panel__summary">
                {detail.accessHistory.length} prior event
                {detail.accessHistory.length === 1 ? '' : 's'}
              </span>
            </div>
            {detail.accessHistory.length ? (
              <ol className="safety-timeline">
                {detail.accessHistory.map((event) => (
                  <AccessEvent key={event.id} event={event} />
                ))}
              </ol>
            ) : (
              <p className="panel-empty">No prior case access has been recorded.</p>
            )}
          </section>
        </div>

        <CaseActions
          caseId={detail.id}
          status={detail.status}
          canReport={hasPermission(user, 'safety:case:report')}
          canRelease={hasPermission(user, 'safety:case:release')}
          canClose={hasPermission(user, 'safety:case:close')}
          canPreviewEvidence={hasPermission(user, 'safety:evidence:read')}
        />
      </div>
    </div>
  );
}
