'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestCodeAction, verifyCodeAction, type SignInState } from './actions';

interface Labels {
  signInTitle: string;
  signInSubtitle: string;
  phone: string;
  phoneHint: string;
  sendCode: string;
  sending: string;
  codeTitle: string;
  codeSentTo: string;
  code: string;
  verify: string;
  verifying: string;
  changeNumber: string;
  invalidPhone: string;
  devCodeNotice: string;
}

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

export function SignInForm({ labels, next }: { labels: Labels; next: string }) {
  const [requestState, requestCode] = useActionState<SignInState, FormData>(requestCodeAction, {
    step: 'phone',
  });
  const [verifyState, verifyCode] = useActionState<SignInState, FormData>(verifyCodeAction, {
    step: 'code',
    phone: requestState.phone,
  });

  const onCodeStep = requestState.step === 'code';
  const phone = requestState.phone ?? verifyState.phone;
  const error = onCodeStep ? verifyState.error : requestState.error;

  return (
    <div className="form-card">
      <h1 style={{ marginTop: 0, fontSize: '1.375rem' }}>
        {onCodeStep ? labels.codeTitle : labels.signInTitle}
      </h1>
      <p className="field__hint" style={{ marginBottom: 24 }}>
        {onCodeStep && phone ? labels.codeSentTo.replace('{phone}', phone) : labels.signInSubtitle}
      </p>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error === 'invalidPhone' ? labels.invalidPhone : error}
        </div>
      ) : null}

      {/* The mock provider returns the code in development so the whole flow can be
          completed without an SMS gateway. Production never populates this. */}
      {onCodeStep && requestState.devCode ? (
        <div className="alert alert--info">
          {labels.devCodeNotice.replace('{code}', requestState.devCode)}
        </div>
      ) : null}

      {!onCodeStep ? (
        <form action={requestCode}>
          <div className="field">
            <label htmlFor="phone">{labels.phone}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  padding: '12px 14px',
                  border: '1px solid var(--locz-border-strong)',
                  borderRadius: 'var(--locz-radius-md)',
                  background: 'var(--locz-surface-muted)',
                  fontWeight: 600,
                }}
              >
                +91
              </span>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                required
                placeholder="9876543210"
                autoFocus
              />
            </div>
            <p className="field__hint">{labels.phoneHint}</p>
          </div>
          <Submit idle={labels.sendCode} busy={labels.sending} />
        </form>
      ) : (
        <form action={verifyCode}>
          <input type="hidden" name="phone" value={phone ?? ''} />
          <input type="hidden" name="next" value={next} />
          <div className="field">
            <label htmlFor="code">{labels.code}</label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              // Lets both Android and iOS auto-fill the code straight from the SMS.
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              style={{ letterSpacing: '0.4em', fontSize: '1.25rem', textAlign: 'center' }}
            />
          </div>
          <Submit idle={labels.verify} busy={labels.verifying} />
        </form>
      )}
    </div>
  );
}
