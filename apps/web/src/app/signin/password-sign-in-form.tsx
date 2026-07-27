'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
import { passwordSignInAction, type SignInState } from './actions';

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
export function PasswordSignInForm({ labels, next }: { labels: Labels; next: string }) {
  const [state, action] = useActionState<SignInState, FormData>(passwordSignInAction, {
    step: 'phone',
  });

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

      <label className="field" htmlFor="signin-password">
        <span>{labels.password}</span>
        <input
          id="signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>

      <Submit idle={labels.submit} busy={labels.submitting} />

      <p className="signin-form__note">
        {labels.newHere} <a href="/register">{labels.createOne}</a>
      </p>
    </form>
  );
}
