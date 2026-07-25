'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { resolveReportAction, type ResolveReportState } from './actions';

export interface ReportItem {
  id: string;
  targetType: string;
  targetId: string;
  targetTitle: string | null;
  reason: string;
  details: string | null;
  status: string;
  reporterName: string;
  reportsAgainstTarget: number;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam or repeated posting',
  FRAUD_OR_SCAM: 'Fraud or a scam',
  PROHIBITED_ITEM: 'Prohibited item',
  DUPLICATE: 'Duplicate listing',
  WRONG_CATEGORY: 'Wrong category',
  OFFENSIVE_CONTENT: 'Offensive content',
  MISLEADING_PRICE: 'Misleading price',
  ALREADY_SOLD: 'Already sold',
  HARASSMENT: 'Harassment',
  OTHER: 'Other',
};

/** Reasons that justify pulling content quickly rather than investigating at leisure. */
const SERIOUS = ['FRAUD_OR_SCAM', 'PROHIBITED_ITEM', 'HARASSMENT', 'OFFENSIVE_CONTENT'];

function ActionButton({
  label,
  busy,
  className,
}: {
  label: string;
  busy: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

export function ReportCard({ report }: { report: ReportItem }) {
  const [decision, setDecision] = useState<'RESOLVED' | 'DISMISSED' | null>(null);
  const [state, action] = useActionState<ResolveReportState, FormData>(resolveReportAction, {});

  const isSerious = SERIOUS.includes(report.reason);
  const isRepeated = report.reportsAgainstTarget > 1;

  return (
    <article className="card queue-item">
      <div>
        <h2 className="queue-item__title">
          {report.targetTitle ??
            `${report.targetType.toLowerCase()} ${report.targetId.slice(0, 8)}`}
        </h2>

        <ul className="queue-item__reasons">
          <li className={`reason${isSerious ? ' reason--severe' : ''}`}>
            {REASON_LABELS[report.reason] ?? report.reason}
          </li>
          {isRepeated ? (
            // The count is what separates a grudge from a pattern.
            <li className="reason reason--severe">
              {report.reportsAgainstTarget} reports against this
            </li>
          ) : null}
        </ul>

        {report.details ? (
          <p
            className="queue-item__meta"
            style={{ marginTop: 12, overflowWrap: 'anywhere', fontStyle: 'italic' }}
          >
            “{report.details}”
          </p>
        ) : null}

        <p className="queue-item__meta" style={{ marginTop: 8 }}>
          Reported by {report.reporterName} ·{' '}
          {new Date(report.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </p>

        {state.error ? (
          <div className="alert alert--error" style={{ marginTop: 12 }} role="alert">
            {state.error}
          </div>
        ) : null}
        {state.message ? (
          <p className="metric__hint" style={{ marginTop: 12, color: 'var(--locz-success)' }}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="queue-actions">
        {decision === null ? (
          <>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => setDecision('RESOLVED')}
            >
              Uphold…
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setDecision('DISMISSED')}
            >
              Dismiss…
            </button>
          </>
        ) : (
          <form action={action}>
            <input type="hidden" name="reportId" value={report.id} />
            <input type="hidden" name="status" value={decision} />

            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor={`note-${report.id}`}>Decision note</label>
              <textarea
                id={`note-${report.id}`}
                name="note"
                rows={3}
                required
                minLength={3}
                placeholder={
                  decision === 'RESOLVED'
                    ? 'Listing removed — asks for payment before viewing.'
                    : 'Checked the listing; nothing against our rules.'
                }
              />
            </div>

            {decision === 'RESOLVED' && report.targetType === 'LISTING' ? (
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: '0.8125rem',
                  marginBottom: 8,
                }}
              >
                <input type="checkbox" name="removeListing" defaultChecked />
                Also remove the listing
              </label>
            ) : null}

            <ActionButton
              label={decision === 'RESOLVED' ? 'Confirm' : 'Dismiss report'}
              busy="Saving…"
              className={decision === 'RESOLVED' ? 'btn btn--danger' : 'btn btn--primary'}
            />
            <button
              type="button"
              className="btn btn--ghost"
              style={{ marginTop: 8, width: '100%' }}
              onClick={() => setDecision(null)}
            >
              Cancel
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
