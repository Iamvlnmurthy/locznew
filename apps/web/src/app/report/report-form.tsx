'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitReportAction, type ReportState } from './actions';

interface Labels {
  title: string;
  reason: string;
  details: string;
  submit: string;
  submitting: string;
  cancel: string;
  success: string;
  reasons: Record<string, string>;
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

export function ReportForm({
  targetType,
  targetId,
  targetTitle,
  labels,
}: {
  targetType: string;
  targetId: string;
  targetTitle: string | null;
  labels: Labels;
}) {
  const [state, action] = useActionState<ReportState, FormData>(submitReportAction, {});

  if (state.sent) {
    return (
      <div className="form-card">
        <div className="alert alert--success">{labels.success}</div>
        <Link href="/" className="btn btn--outline btn--block">
          {labels.cancel}
        </Link>
      </div>
    );
  }

  return (
    <form className="form-card" action={action}>
      <h1 style={{ marginTop: 0, fontSize: '1.375rem' }}>{labels.title}</h1>

      {targetTitle ? (
        <p className="field__hint" style={{ marginBottom: 24, overflowWrap: 'anywhere' }}>
          “{targetTitle}”
        </p>
      ) : null}

      {state.error ? (
        <div className="alert alert--error" role="alert">
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />

      <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
        <legend style={{ fontWeight: 600, marginBottom: 12 }}>{labels.reason}</legend>
        {Object.entries(labels.reasons).map(([value, label], index) => (
          <label
            key={value}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              padding: '10px 0',
              cursor: 'pointer',
            }}
          >
            <input type="radio" name="reason" value={value} required defaultChecked={index === 0} />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor="details">{labels.details}</label>
        <textarea id="details" name="details" rows={4} maxLength={1000} />
      </div>

      <SubmitButton idle={labels.submit} busy={labels.submitting} />
      <Link href="/" className="btn btn--ghost btn--block" style={{ marginTop: 8 }}>
        {labels.cancel}
      </Link>
    </form>
  );
}
