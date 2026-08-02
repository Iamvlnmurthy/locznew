'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AdminQueueCopy } from '@/lib/queue-copy';
import { ConsoleIcon } from '../../console-icon';
import { decideClaimAction, type ClaimActionCopy, type ClaimDecisionState } from './actions';

function Buttons({ copy }: { copy: AdminQueueCopy }) {
  const { pending } = useFormStatus();
  return (
    <div className="claim-review-actions">
      <button
        type="submit"
        name="intent"
        value="reject"
        className="btn btn--danger"
        disabled={pending}
      >
        {pending ? copy.working : copy.reject}
      </button>
      <button
        type="submit"
        name="intent"
        value="approve"
        className="btn btn--primary"
        disabled={pending}
      >
        <ConsoleIcon name="shield" size={15} /> {pending ? copy.working : copy.approve}
      </button>
    </div>
  );
}

export function ClaimDecision({ claimId, copy }: { claimId: string; copy: AdminQueueCopy }) {
  const actionCopy: ClaimActionCopy = {
    missingClaim: copy.missingClaim,
    reasonShort: copy.reasonShort,
    approveError: copy.approveError,
    rejectError: copy.rejectError,
    approved: copy.approved,
    rejected: copy.rejected,
  };
  const bound = decideClaimAction.bind(null, actionCopy);
  const [state, action] = useActionState<ClaimDecisionState, FormData>(bound, {});
  return (
    <form action={action} className="claim-review-decision">
      <input type="hidden" name="claimId" value={claimId} />
      <label>
        <span>{copy.rejectReason}</span>
        <textarea
          name="reason"
          minLength={5}
          maxLength={400}
          rows={2}
          placeholder={copy.rejectPlaceholder}
        />
        <small>{copy.rejectHint}</small>
      </label>
      <Buttons copy={copy} />
      {state.error ? (
        <p className="form-message is-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="form-message" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
