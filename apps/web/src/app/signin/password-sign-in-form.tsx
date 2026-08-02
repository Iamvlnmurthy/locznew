'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { passwordSignInAction, type SignInState } from './actions';
import { GoogleSignIn } from './google-sign-in';

interface Labels {
  title: string;
  subtitle: string;
  phone: string;
  phoneHint: string;
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
  googleAccountRequired: string;
  googleUnavailable: string;
  googleFailed: string;
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
        <label htmlFor="signin-phone">{labels.phone}</label>
        <div className="signin-phone">
          <span>
            <span aria-hidden="true">🇮🇳</span>
            +91
          </span>
          <input
            id="signin-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            minLength={10}
            maxLength={10}
            required
            placeholder="98765 43210"
            defaultValue={state.phone?.replace(/^\+91/, '') ?? ''}
          />
        </div>
        <small className="field__hint">{labels.phoneHint}</small>
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
      </div>

      <Submit idle={labels.submit} busy={labels.submitting} />

      {googleClientId ? (
        <GoogleSignIn
          clientId={googleClientId}
          next={next}
          labels={{
            divider: labels.googleDivider,
            button: labels.googleButton,
            accountRequired: labels.googleAccountRequired,
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
