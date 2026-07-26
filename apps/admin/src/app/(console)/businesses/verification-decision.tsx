'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ConsoleIcon } from '../console-icon';
import { setBusinessVerificationAction, type VerificationDecisionState } from './actions';

function DecisionButtons() {
  const { pending } = useFormStatus();
  return (
    <div className="business-review-actions">
      <button type="submit" name="status" value="REJECTED" disabled={pending}>
        Needs correction
      </button>
      <button type="submit" name="status" value="VERIFIED" disabled={pending}>
        <ConsoleIcon name="shield" size={15} />
        {pending ? 'Saving…' : 'Verify business'}
      </button>
    </div>
  );
}

export function VerificationDecision({ businessId }: { businessId: string }) {
  const boundAction = setBusinessVerificationAction.bind(null, businessId);
  const [state, action] = useActionState<VerificationDecisionState, FormData>(boundAction, {});

  return (
    <form className="business-review-decision" action={action}>
      <label>
        <span>Review note</span>
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          placeholder="Required when details need correction"
        />
      </label>
      <DecisionButtons />
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
