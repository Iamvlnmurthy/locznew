'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" style={{ width: '100%' }} disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <main className="login">
      <div className="card login__card">
        <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem' }}>
          Loc<span style={{ color: 'var(--locz-primary)' }}>Z</span>
        </h1>
        <p
          style={{ margin: '0 0 24px', color: 'var(--locz-text-secondary)', fontSize: '0.875rem' }}
        >
          Moderation and operations console
        </p>

        {state.error ? (
          <div className="alert alert--error" role="alert">
            {state.error}
          </div>
        ) : null}

        <form action={formAction}>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="moderator@locz.test"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <SubmitButton />
        </form>
      </div>
    </main>
  );
}
