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

export function VerificationDecision({ businessId, slug }: { businessId: string; slug?: string }) {
  const boundAction = setBusinessVerificationAction.bind(null, businessId);
  const [state, action] = useActionState<VerificationDecisionState, FormData>(boundAction, {});
  const profileUrl = slug ? `https://locz.in/b/${slug}` : null;
  const verified = state.message?.toLowerCase().includes('verified');

  return (
    <form className="business-review-decision" action={action}>
      {profileUrl ? (
        <a
          className="business-review-profile-link"
          href={profileUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ConsoleIcon name="search" size={14} /> Review the public profile before verifying
          <ConsoleIcon name="arrow" size={14} />
        </a>
      ) : null}
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
          <ConsoleIcon name="shield" size={14} /> {state.message}
          {verified && profileUrl ? (
            <>
              {' — '}
              <a href={profileUrl} target="_blank" rel="noreferrer">
                view the verified page
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
