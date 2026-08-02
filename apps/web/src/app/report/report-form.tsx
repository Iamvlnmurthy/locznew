'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { submitReportAction, type ReportState } from './actions';

interface Labels {
  title: string;
  reason: string;
  details: string;
  submit: string;
  submitting: string;
  cancel: string;
  success: string;
  successTitle: string;
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
      <div className="report-card report-card--success" role="status">
        <span className="report-card__success-icon">
          <Icon name="check" />
        </span>
        <h2>{labels.successTitle}</h2>
        <p>{labels.success}</p>
        <Link href="/" className="btn btn--outline btn--block">
          {labels.cancel}
        </Link>
      </div>
    );
  }

  return (
    <form className="report-card" action={action}>
      <div className="report-card__heading">
        <span>
          <Icon name="shield" />
        </span>
        <h2>{labels.title}</h2>
      </div>

      {targetTitle ? <p className="report-card__target">“{targetTitle}”</p> : null}

      {state.error ? (
        <div className="alert alert--error" role="alert">
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />

      <fieldset className="report-reasons">
        <legend>{labels.reason}</legend>
        {Object.entries(labels.reasons).map(([value, label], index) => (
          <label key={value}>
            <input type="radio" name="reason" value={value} required defaultChecked={index === 0} />
            <span>{label}</span>
            <i aria-hidden="true" />
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor="details">{labels.details}</label>
        <textarea id="details" name="details" rows={4} maxLength={1000} />
      </div>

      <SubmitButton idle={labels.submit} busy={labels.submitting} />
      <Link href="/" className="btn btn--ghost btn--block report-card__cancel">
        {labels.cancel}
      </Link>
    </form>
  );
}
