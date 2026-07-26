'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icons';
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
  name: string;
  nameHint: string;
  optional: string;
  codeHint: string;
  noPassword: string;
  accountNote: string;
  privacyNote: string;
  resend: string;
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

export function SignInForm({ labels, next }: { labels: Labels; next: string }) {
  const [requestState, requestCode] = useActionState<SignInState, FormData>(requestCodeAction, {
    step: 'phone',
  });
  const [verifyState, verifyCode] = useActionState<SignInState, FormData>(verifyCodeAction, {
    step: 'code',
  });
  const [editingPhone, setEditingPhone] = useState(false);
  const [deviceKey, setDeviceKey] = useState('');

  useEffect(() => {
    const storageKey = 'locz_device_key';
    let resolvedDeviceKey: string;
    try {
      const existing = window.localStorage.getItem(storageKey);
      if (existing) {
        resolvedDeviceKey = existing;
      } else {
        resolvedDeviceKey = `web-${window.crypto.randomUUID()}`;
        window.localStorage.setItem(storageKey, resolvedDeviceKey);
      }
    } catch {
      // Privacy-restricted browsers can disable storage; the session still works,
      // it simply receives a fresh device identifier for this sign-in.
      resolvedDeviceKey = `web-${window.crypto.randomUUID()}`;
    }
    queueMicrotask(() => setDeviceKey(resolvedDeviceKey));
  }, []);

  const onCodeStep = requestState.step === 'code' && !editingPhone;
  const phone = requestState.phone ?? verifyState.phone;
  const error = onCodeStep ? verifyState.error : requestState.error;
  const nationalPhone = phone?.replace(/^\+91/, '') ?? '';

  return (
    <div className="signin-form">
      <div className="signin-form__heading">
        <span className="signin-form__step">{onCodeStep ? '02' : '01'} / 02</span>
        <h2>{onCodeStep ? labels.codeTitle : labels.signInTitle}</h2>
        <p>
          {onCodeStep && phone
            ? labels.codeSentTo.replace('{phone}', formatPhone(phone))
            : labels.signInSubtitle}
        </p>
      </div>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error === 'invalidPhone' ? labels.invalidPhone : error}
        </div>
      ) : null}

      {onCodeStep && requestState.devCode ? (
        <div className="signin-form__dev-code" role="status">
          <span>
            <Icon name="sparkles" width="17" height="17" />
          </span>
          <div>
            <small>{labels.devCodeNotice.replace('{code}', '')}</small>
            <strong>{requestState.devCode}</strong>
          </div>
        </div>
      ) : null}

      {!onCodeStep ? (
        <form
          action={requestCode}
          onSubmit={() => setEditingPhone(false)}
          className="signin-form__fields"
        >
          <div className="field">
            <label htmlFor="phone">{labels.phone}</label>
            <div className="signin-phone">
              <span>
                <span aria-hidden="true">🇮🇳</span>
                +91
              </span>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                minLength={10}
                required
                placeholder="98765 43210"
                defaultValue={nationalPhone}
                autoFocus
              />
            </div>
            <p className="field__hint">{labels.phoneHint}</p>
          </div>
          <Submit idle={labels.sendCode} busy={labels.sending} />
          <p className="signin-form__account-note">{labels.accountNote}</p>
        </form>
      ) : (
        <form action={verifyCode} className="signin-form__fields">
          <input type="hidden" name="phone" value={phone ?? ''} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="deviceKey" value={deviceKey} />

          <div className="field">
            <div className="signin-field-label">
              <label htmlFor="code">{labels.code}</label>
              <button type="button" onClick={() => setEditingPhone(true)}>
                {labels.changeNumber}
              </button>
            </div>
            <input
              className="signin-code"
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              minLength={4}
              required
              autoFocus
              placeholder="••••••"
            />
            <p className="field__hint">{labels.codeHint}</p>
          </div>

          <div className="field">
            <div className="signin-field-label">
              <label htmlFor="displayName">{labels.name}</label>
              <span>{labels.optional}</span>
            </div>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              maxLength={120}
              placeholder={labels.nameHint}
            />
          </div>

          <Submit idle={labels.verify} busy={labels.verifying} />
          <button className="signin-form__resend" type="submit" formAction={requestCode}>
            {labels.resend}
          </button>
          <p className="signin-form__account-note">{labels.noPassword}</p>
        </form>
      )}
    </div>
  );
}

function formatPhone(phone: string): string {
  const national = phone.replace(/^\+91/, '');
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
}
