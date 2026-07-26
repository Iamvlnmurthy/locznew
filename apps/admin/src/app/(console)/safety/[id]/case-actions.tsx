'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { SafetyCaseStatus } from '@/lib/safety-types';
import {
  closeSafetyCaseAction,
  releaseSafetyCaseAction,
  reportSafetyCaseAction,
  requestEvidencePreviewAction,
  type SafetyActionState,
} from '../actions';

type ActionMode = 'report' | 'release' | 'close' | 'evidence' | null;

interface CaseActionsProps {
  caseId: string;
  status: SafetyCaseStatus;
  canReport: boolean;
  canRelease: boolean;
  canClose: boolean;
  canPreviewEvidence: boolean;
}

function SubmitButton({
  children,
  pendingLabel,
  tone = 'primary',
}: {
  children: React.ReactNode;
  pendingLabel: string;
  tone?: 'primary' | 'danger' | 'ghost';
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn--${tone}`} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

function Feedback({ state }: { state: SafetyActionState }) {
  if (!state.error && !state.message) return null;
  return (
    <div
      className={`safety-action-feedback ${
        state.error ? 'safety-action-feedback--error' : 'safety-action-feedback--success'
      }`}
      role={state.error ? 'alert' : 'status'}
    >
      {state.error ?? state.message}
    </div>
  );
}

function JustificationField({
  id,
  label,
  placeholder,
}: {
  id: string;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        name="justification"
        rows={4}
        minLength={15}
        maxLength={500}
        required
        placeholder={placeholder}
      />
      <small className="safety-form-hint">15–500 characters · stored in the restricted log</small>
    </div>
  );
}

export function CaseActions({
  caseId,
  status,
  canReport,
  canRelease,
  canClose,
  canPreviewEvidence,
}: CaseActionsProps) {
  const [mode, setMode] = useState<ActionMode>(null);
  const [reportState, reportAction] = useActionState(reportSafetyCaseAction, {});
  const [releaseState, releaseAction] = useActionState(releaseSafetyCaseAction, {});
  const [closeState, closeAction] = useActionState(closeSafetyCaseAction, {});
  const [evidenceState, evidenceAction] = useActionState(requestEvidencePreviewAction, {});

  const canAct =
    (status === 'OPEN' && canReport) ||
    ((status === 'OPEN' || status === 'REPORTED') && canRelease) ||
    (status === 'REPORTED' && canClose);

  return (
    <aside className="safety-actions" aria-label="Case actions">
      <div className="safety-actions__heading">
        <span className="panel__kicker">Next decision</span>
        <h2>Handle this case</h2>
        <p>Every action requires an explicit grant and leaves a named audit event.</p>
      </div>

      {canAct ? (
        <div className="safety-action-choices">
          {status === 'OPEN' && canReport ? (
            <button
              type="button"
              className="safety-action-choice"
              data-safety-action="report"
              aria-expanded={mode === 'report'}
              onClick={() => setMode(mode === 'report' ? null : 'report')}
            >
              <span>
                <strong>Record external report</strong>
                <small>Add the approved channel acknowledgement.</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          ) : null}

          {(status === 'OPEN' || status === 'REPORTED') && canRelease ? (
            <button
              type="button"
              className="safety-action-choice"
              data-safety-action="release"
              aria-expanded={mode === 'release'}
              onClick={() => setMode(mode === 'release' ? null : 'release')}
            >
              <span>
                <strong>Release false positive</strong>
                <small>Returns the image to ordinary human review.</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          ) : null}

          {status === 'REPORTED' && canClose ? (
            <button
              type="button"
              className="safety-action-choice"
              data-safety-action="close"
              aria-expanded={mode === 'close'}
              onClick={() => setMode(mode === 'close' ? null : 'close')}
            >
              <span>
                <strong>Close active handling</strong>
                <small>Preserves the legal hold and all evidence.</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="safety-actions__settled">
          <strong>No lifecycle action available</strong>
          <p>This case is settled, or your account does not hold the required permission.</p>
        </div>
      )}

      {mode === 'report' ? (
        <form action={reportAction} className="safety-action-form">
          <input type="hidden" name="caseId" value={caseId} />
          <div className="field">
            <label htmlFor="report-reference">Reporting acknowledgement</label>
            <input
              id="report-reference"
              name="reportReference"
              minLength={5}
              maxLength={200}
              autoComplete="off"
              required
              placeholder="REPORT-2026-07-26-004"
            />
          </div>
          <JustificationField
            id="report-justification"
            label="How was this reported?"
            placeholder="Submitted by the named officer through the approved reporting channel."
          />
          <Feedback state={reportState} />
          <SubmitButton pendingLabel="Recording report…">Confirm report</SubmitButton>
        </form>
      ) : null}

      {mode === 'release' ? (
        <form action={releaseAction} className="safety-action-form">
          <input type="hidden" name="caseId" value={caseId} />
          <div className="safety-action-warning">
            This removes the legal hold, but does not publish the image. It returns to a moderator
            for ordinary review.
          </div>
          <JustificationField
            id="release-justification"
            label="Why is this a false positive?"
            placeholder="Confirmed false positive after the approved specialist review."
          />
          <Feedback state={releaseState} />
          <SubmitButton pendingLabel="Releasing hold…">Release to review</SubmitButton>
        </form>
      ) : null}

      {mode === 'close' ? (
        <form action={closeAction} className="safety-action-form">
          <input type="hidden" name="caseId" value={caseId} />
          <div className="safety-action-warning">
            Closing ends active handling. It does not release or delete the held original.
          </div>
          <JustificationField
            id="close-justification"
            label="Why is active handling complete?"
            placeholder="Reporting acknowledgement recorded and follow-up completed."
          />
          <Feedback state={closeState} />
          <SubmitButton pendingLabel="Closing case…">Close case</SubmitButton>
        </form>
      ) : null}

      {canPreviewEvidence && (status === 'OPEN' || status === 'REPORTED') ? (
        <div className="safety-evidence-gate">
          <button
            type="button"
            className="safety-evidence-gate__trigger"
            data-safety-action="evidence"
            aria-expanded={mode === 'evidence'}
            onClick={() => setMode(mode === 'evidence' ? null : 'evidence')}
          >
            <span aria-hidden="true">◉</span>
            <span>
              <strong>Evidence access</strong>
              <small>Concealed until you justify a preview.</small>
            </span>
          </button>

          {mode === 'evidence' ? (
            <form
              action={evidenceAction}
              className="safety-action-form safety-action-form--evidence"
            >
              <input type="hidden" name="caseId" value={caseId} />
              <JustificationField
                id="evidence-justification"
                label="Why must you view the evidence?"
                placeholder="Verify the provider match before completing the approved report."
              />
              <Feedback state={evidenceState} />
              {evidenceState.preview ? (
                <a
                  className="btn btn--danger safety-preview-link"
                  href={evidenceState.preview.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open {Math.ceil(evidenceState.preview.expiresInSeconds / 60)}-minute preview
                </a>
              ) : (
                <SubmitButton pendingLabel="Preparing audited link…" tone="danger">
                  Prepare preview link
                </SubmitButton>
              )}
              <p className="safety-form-hint">
                The image is never embedded here. The signed link opens only after a second
                deliberate click.
              </p>
            </form>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
