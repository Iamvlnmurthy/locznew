'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from './actions';
import { GoogleConsoleSignIn } from './google-console-sign-in';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary login__submit" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
      <span aria-hidden="true">→</span>
    </button>
  );
}

export function LoginForm({ googleClientId }: { googleClientId: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <main className="login">
      <section className="login__story">
        <div className="login__brand">
          <span className="brand-mark" aria-hidden="true">
            L<span>Z</span>
          </span>
          <span>
            Loc<strong>Z</strong>
          </span>
        </div>
        <div className="login__message">
          <span className="eyebrow">Operations centre</span>
          <h1>Keep local discovery useful, safe and human.</h1>
          <p>The working space for LocZ moderators and platform operators across India.</p>
        </div>
        <div className="login__trust">
          <span className="status-dot" />
          Protected staff access
        </div>
      </section>

      <section className="login__form-side">
        <div className="login__card">
          <div className="login__card-heading">
            <span className="login__mobile-logo">
              Loc<strong>Z</strong>
            </span>
            <span className="eyebrow">Welcome back</span>
            <h2>Sign in to your workspace</h2>
            <p>Use your approved LocZ staff account.</p>
          </div>

          {state.error ? (
            <div className="alert alert--error" role="alert">
              {state.error}
            </div>
          ) : null}

          <form action={formAction}>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="name@locz.in"
              />
            </div>

            <div className="field">
              <div className="field__label-row">
                <label htmlFor="password">Password</label>
                <span>Case-sensitive</span>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
            </div>

            <SubmitButton />
          </form>
          <GoogleConsoleSignIn clientId={googleClientId} />

          <p className="login__help">Having trouble signing in? Contact your LocZ administrator.</p>
        </div>
        <p className="login__legal">Authorised access only · Activity is securely audited</p>
      </section>
    </main>
  );
}
