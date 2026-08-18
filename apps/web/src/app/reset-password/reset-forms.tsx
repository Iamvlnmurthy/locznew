'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import {
  completeResetAction,
  requestResetAction,
  type CompleteResetState,
  type RequestResetState,
} from './actions';

export interface ResetLabels {
  requestTitle: string;
  requestSubtitle: string;
  email: string;
  submit: string;
  submitting: string;
  invalidEmail: string;
  sentTitle: string;
  sentBody: string;
  sentNote: string;
  backToSignIn: string;
  completeTitle: string;
  completeSubtitle: string;
  newPassword: string;
  confirmPassword: string;
  save: string;
  saving: string;
  tooShort: string;
  mismatch: string;
  expiredTitle: string;
  expiredBody: string;
  requestAnother: string;
  signOutNote: string;
  showPassword: string;
  hidePassword: string;
  failed: string;
}

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary signin-form__submit" disabled={pending}>
      <span>{pending ? busy : idle}</span>
      <Icon name="arrow" width="17" height="17" />
    </button>
  );
}

/** Step one: ask for the link. */
export function RequestResetForm({ labels }: { labels: ResetLabels }) {
  const [state, action] = useActionState<RequestResetState, FormData>(requestResetAction, {});

  if (state.sent) {
    return (
      <div className="signin-form">
        <h1>{labels.sentTitle}</h1>
        <p className="signin-form__subtitle">{labels.sentBody}</p>
        <p className="signin-form__note">{labels.sentNote}</p>
        <p className="signin-form__note">
          <a href="/signin">{labels.backToSignIn}</a>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="signin-form">
      <h1>{labels.requestTitle}</h1>
      <p className="signin-form__subtitle">{labels.requestSubtitle}</p>

      {state.error ? (
        <p className="signin-form__error" role="alert">
          {state.error === 'invalidEmail' ? labels.invalidEmail : labels.failed}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="reset-email">{labels.email}</label>
        <input
          id="reset-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="you@example.com"
          defaultValue={state.email ?? ''}
        />
      </div>

      <Submit idle={labels.submit} busy={labels.submitting} />

      <p className="signin-form__note">
        <a href="/signin">{labels.backToSignIn}</a>
      </p>
    </form>
  );
}

/** Step two: choose the new password, having arrived from the emailed link. */
export function CompleteResetForm({ token, labels }: { token: string; labels: ResetLabels }) {
  const [state, action] = useActionState<CompleteResetState, FormData>(
    completeResetAction.bind(null, token),
    {},
  );
  const [visible, setVisible] = useState(false);

  const message = state.error
    ? { tooShort: labels.tooShort, mismatch: labels.mismatch, failed: labels.failed }[state.error]
    : null;

  return (
    <form action={action} className="signin-form">
      <h1>{labels.completeTitle}</h1>
      <p className="signin-form__subtitle">{labels.completeSubtitle}</p>

      {message ? (
        <p className="signin-form__error" role="alert">
          {message}
        </p>
      ) : null}

      <div className="field">
        <div className="auth-field-label">
          <label htmlFor="reset-password">{labels.newPassword}</label>
          <button type="button" onClick={() => setVisible((value) => !value)}>
            {visible ? labels.hidePassword : labels.showPassword}
          </button>
        </div>
        <input
          id="reset-password"
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="reset-password-confirm">{labels.confirmPassword}</label>
        <input
          id="reset-password-confirm"
          name="confirmPassword"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <Submit idle={labels.save} busy={labels.saving} />

      <p className="signin-form__note">{labels.signOutNote}</p>
    </form>
  );
}

/** The link was expired, already used, or never existed — the API does not say which. */
export function ExpiredLink({ labels }: { labels: ResetLabels }) {
  return (
    <div className="signin-form">
      <h1>{labels.expiredTitle}</h1>
      <p className="signin-form__subtitle">{labels.expiredBody}</p>
      <p className="signin-form__note">
        <a href="/reset-password">{labels.requestAnother}</a>
      </p>
      <p className="signin-form__note">
        <a href="/signin">{labels.backToSignIn}</a>
      </p>
    </div>
  );
}
