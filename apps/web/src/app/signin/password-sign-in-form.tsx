'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { passwordSignInAction, type SignInState } from './actions';
import { GoogleSignIn } from './google-sign-in';

interface Labels {
  title: string;
  subtitle: string;
  email: string;
  emailHint: string;
  password: string;
  submit: string;
  submitting: string;
  invalidPhone: string;
  missingPassword: string;
  badCredentials: string;
  error: string;
  newHere: string;
  createOne: string;
  showPassword: string;
  hidePassword: string;
  googleDivider: string;
  googleButton: string;
  googleUnavailable: string;
  googleFailed: string;
  forgotPassword: string;
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

/**
 * Sign-in with a mobile number and password.
 *
 * The one-time-code form is still in the codebase and the endpoints still work, but nothing
 * routes here to them. Without an SMS gateway those codes were a single shared PIN, which
 * proves knowledge of four digits rather than ownership of a number — worse than a password
 * while looking more secure. This is the honest version until real SMS is configured.
 */
export function PasswordSignInForm({
  labels,
  next,
  googleClientId,
}: {
  labels: Labels;
  next: string;
  googleClientId?: string;
}) {
  const [state, action] = useActionState<SignInState, FormData>(passwordSignInAction, {
    step: 'phone',
  });
  const [showPassword, setShowPassword] = useState(false);

  const message = state.error
    ? ((
        {
          invalidPhone: labels.invalidPhone,
          missingPassword: labels.missingPassword,
          badCredentials: labels.badCredentials,
        } as Record<string, string>
      )[state.error] ?? labels.error)
    : null;

  return (
    <form action={action} className="signin-form">
      <input type="hidden" name="next" value={next} />

      <h1>{labels.title}</h1>
      <p className="signin-form__subtitle">{labels.subtitle}</p>

      {message ? (
        <p className="signin-form__error" role="alert">
          {message}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="signin-email">{labels.email}</label>
        <input
          id="signin-email"
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
        <small className="field__hint">{labels.emailHint}</small>
      </div>

      <div className="field">
        <div className="auth-field-label">
          <label htmlFor="signin-password">{labels.password}</label>
          <button type="button" onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? labels.hidePassword : labels.showPassword}
          </button>
        </div>
        <input
          id="signin-password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
        />
        {/* The only way into the reset flow. The API has always implemented it and nothing
            in any client linked to it, so a forgotten password meant a lost account. */}
        <small className="field__hint signin-form__forgot">
          <a href="/reset-password">{labels.forgotPassword}</a>
        </small>
      </div>

      <Submit idle={labels.submit} busy={labels.submitting} />

      {googleClientId ? (
        <GoogleSignIn
          clientId={googleClientId}
          next={next}
          labels={{
            divider: labels.googleDivider,
            button: labels.googleButton,
            unavailable: labels.googleUnavailable,
            failed: labels.googleFailed,
          }}
        />
      ) : null}

      <p className="signin-form__note">
        {labels.newHere} <a href="/register">{labels.createOne}</a>
      </p>
    </form>
  );
}
