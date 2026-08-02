'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { registerAction, type RegisterState } from './actions';

interface Labels {
  title: string;
  subtitle: string;
  name: string;
  nameHint: string;
  phone: string;
  phoneHint: string;
  password: string;
  passwordHint: string;
  confirmPassword: string;
  submit: string;
  submitting: string;
  haveAccount: string;
  signIn: string;
  invalidName: string;
  invalidPhone: string;
  shortPassword: string;
  passwordMismatch: string;
  phoneTaken: string;
  error: string;
  showPassword: string;
  hidePassword: string;
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

export function RegisterForm({ labels }: { labels: Labels }) {
  const [state, action] = useActionState<RegisterState, FormData>(registerAction, {});
  const [showPassword, setShowPassword] = useState(false);

  // Every failure the action can return has its own sentence. A single "something went
  // wrong" would leave someone guessing which of four fields to change.
  const message = state.error
    ? ((
        {
          invalidName: labels.invalidName,
          invalidPhone: labels.invalidPhone,
          shortPassword: labels.shortPassword,
          passwordMismatch: labels.passwordMismatch,
          phoneTaken: labels.phoneTaken,
        } as Record<string, string>
      )[state.error] ?? labels.error)
    : null;

  return (
    <form action={action} className="signin-form">
      <h1>{labels.title}</h1>
      <p className="signin-form__subtitle">{labels.subtitle}</p>

      {message ? (
        // `alert` so a screen reader announces the failure rather than leaving the user to
        // discover it by re-reading the form.
        <p className="signin-form__error" role="alert">
          {message}
        </p>
      ) : null}

      <label className="field" htmlFor="register-name">
        <span>{labels.name}</span>
        <input
          id="register-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          defaultValue={state.values?.name ?? ''}
        />
        <small className="field__hint">{labels.nameHint}</small>
      </label>

      <div className="field">
        <span>{labels.phone}</span>
        <div className="signin-phone">
          <span>
            <span aria-hidden="true">🇮🇳</span>+91
          </span>
          <input
            id="register-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            minLength={10}
            maxLength={10}
            required
            defaultValue={state.values?.phone?.replace(/^\+91/, '') ?? ''}
          />
        </div>
        <small className="field__hint">{labels.phoneHint}</small>
      </div>

      <div className="field">
        <div className="auth-field-label">
          <label htmlFor="register-password">{labels.password}</label>
          <button type="button" onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? labels.hidePassword : labels.showPassword}
          </button>
        </div>
        {/* `new-password` so password managers offer to generate one rather than filling
            an existing credential into a sign-up form. */}
        <input
          id="register-password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <small className="field__hint">{labels.passwordHint}</small>
      </div>

      <label className="field" htmlFor="register-confirm">
        <span>{labels.confirmPassword}</span>
        <input
          id="register-confirm"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>

      <Submit idle={labels.submit} busy={labels.submitting} />

      <p className="signin-form__note">
        {labels.haveAccount} <a href="/signin">{labels.signIn}</a>
      </p>
    </form>
  );
}
