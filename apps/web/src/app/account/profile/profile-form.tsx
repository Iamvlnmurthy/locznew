'use client';

import { useActionState } from 'react';
import { type ProfileState, updateProfileAction } from './actions';

interface Labels {
  name: string;
  nameHint: string;
  email: string;
  emailHint: string;
  bio: string;
  bioHint: string;
  save: string;
  saved: string;
  invalidName: string;
  invalidEmail: string;
  emailTaken: string;
  failed: string;
}

const INITIAL: ProfileState = { status: 'idle' };

/**
 * Editing your own details.
 *
 * A plain form and a server action, so it submits without JavaScript. The phone number is
 * deliberately absent: it is changed by verifying a new one, not by typing over the old one,
 * because an unverified number a buyer cannot reach is worse than no change at all.
 */
export function ProfileForm({
  labels,
  current,
}: {
  labels: Labels;
  current: { displayName: string; email: string | null; bio: string | null };
}) {
  const [state, action, pending] = useActionState(updateProfileAction, INITIAL);

  const value = (field: 'displayName' | 'email' | 'bio', fallback: string | null): string =>
    state.values?.[field] ?? fallback ?? '';

  return (
    <form action={action} className="auth-form">
      {state.status === 'saved' ? (
        <p className="signin-form__success" role="status">
          {labels.saved}
        </p>
      ) : null}

      {state.status === 'error' && state.error ? (
        <p className="signin-form__error" role="alert">
          {labels[state.error as keyof Labels]}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="profile-name">{labels.name}</label>
        <input
          id="profile-name"
          name="displayName"
          required
          minLength={2}
          maxLength={120}
          defaultValue={value('displayName', current.displayName)}
        />
        <small className="field__hint">{labels.nameHint}</small>
      </div>

      <div className="field">
        <label htmlFor="profile-email">{labels.email}</label>
        <input
          id="profile-email"
          name="email"
          type="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={value('email', current.email)}
        />
        <small className="field__hint">{labels.emailHint}</small>
      </div>

      <div className="field">
        <label htmlFor="profile-bio">{labels.bio}</label>
        <textarea
          id="profile-bio"
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={value('bio', current.bio)}
        />
        <small className="field__hint">{labels.bioHint}</small>
      </div>

      <button type="submit" disabled={pending}>
        {labels.save}
      </button>
    </form>
  );
}
