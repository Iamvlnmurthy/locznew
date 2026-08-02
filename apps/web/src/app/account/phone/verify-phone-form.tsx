'use client';

import { useRef, useState } from 'react';
import { firebaseAuth, isPhoneVerificationConfigured } from '../../../lib/firebase';
import { confirmPhoneAction } from './actions';

interface Labels {
  title: string;
  intro: string;
  phone: string;
  phoneHint: string;
  send: string;
  code: string;
  codeHint: string;
  confirm: string;
  resend: string;
  confirmed: string;
  unavailable: string;
  invalidPhone: string;
  invalidCode: string;
  tooManyAttempts: string;
  alreadyTaken: string;
  failed: string;
  continue: string;
  skip: string;
  skipHint: string;
}

type Step = 'phone' | 'code' | 'done';

/**
 * Confirming a mobile number.
 *
 * The device verifies the number with Firebase and the API verifies what Firebase returns.
 * Nothing here decides anything: this component's whole job is to collect a number, collect a
 * code, and hand the resulting assertion to the server.
 *
 * The reCAPTCHA is not optional and cannot be hidden. Firebase requires it on the web, which
 * is why the mobile app's version of this flow will feel noticeably smoother — Android has
 * Play Integrity instead and never shows anything.
 */
export function VerifyPhoneForm({ labels, next = '/' }: { labels: Labels; next?: string }) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<keyof Labels | null>(null);
  const [pending, setPending] = useState(false);

  // Held across renders because the confirmation is what the code is checked against, and
  // React state would be a re-render away from being stale at exactly the wrong moment.
  const confirmation = useRef<{
    confirm(code: string): Promise<{ user: { getIdToken(): Promise<string> } }>;
  } | null>(null);
  const recaptcha = useRef<{ clear(): void } | null>(null);

  if (!isPhoneVerificationConfigured()) {
    return (
      <section className="signin-form verify-phone-form">
        <p className="signin-form__error">{labels.unavailable}</p>
      </section>
    );
  }

  async function sendCode(): Promise<void> {
    const national = phone.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(national)) {
      setError('invalidPhone');
      return;
    }

    setPending(true);
    setError(null);

    try {
      // Imported here rather than at module scope so the SDK is fetched when somebody
      // actually verifies a number, not on every page that might.
      const { RecaptchaVerifier, signInWithPhoneNumber } = await import('firebase/auth');
      const auth = firebaseAuth();

      // Rebuilt each attempt. A solved reCAPTCHA is single-use, so reusing the verifier after
      // a failed send produces an error that reads like a network fault.
      recaptcha.current?.clear();
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      recaptcha.current = verifier;

      confirmation.current = await signInWithPhoneNumber(auth, `+91${national}`, verifier);
      setStep('code');
    } catch (caught) {
      setError(errorKeyFor(caught));
    } finally {
      setPending(false);
    }
  }

  async function confirmCode(): Promise<void> {
    if (!/^\d{6}$/.test(code) || !confirmation.current) {
      setError('invalidCode');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const credential = await confirmation.current.confirm(code);
      // The token, not the number. What the API trusts is Google's signature over the claim,
      // never anything this form could type into a field.
      const idToken = await credential.user.getIdToken();

      const result = await confirmPhoneAction(idToken);
      if (result.status === 'confirmed') {
        setStep('done');
        return;
      }

      setError(result.error === 'alreadyTaken' ? 'alreadyTaken' : 'failed');
    } catch (caught) {
      setError(errorKeyFor(caught));
    } finally {
      setPending(false);
    }
  }

  if (step === 'done') {
    return (
      <section className="signin-form verify-phone-form verify-phone-form--done">
        <p className="signin-form__success">{labels.confirmed}</p>
        <a className="btn btn--primary btn--block" href={next}>
          {labels.continue}
        </a>
      </section>
    );
  }

  return (
    <section className="signin-form verify-phone-form">
      <header className="signin-form__heading">
        <h2>{labels.title}</h2>
        <p>{labels.intro}</p>
      </header>

      {error ? (
        <p className="signin-form__error" role="alert">
          {labels[error]}
        </p>
      ) : null}

      {step === 'phone' ? (
        <div className="field">
          <label htmlFor="verify-phone">{labels.phone}</label>
          <div className="signin-phone">
            <span>
              <span aria-hidden="true">🇮🇳</span>+91
            </span>
            <input
              id="verify-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <small className="field__hint">{labels.phoneHint}</small>
          <button
            className="btn btn--primary signin-form__submit"
            type="button"
            onClick={() => void sendCode()}
            disabled={pending}
          >
            {labels.send}
          </button>
          {/* A Google sign-up is sent straight here, so this page has to be leavable. An
              account with no number can still browse, save and message; making it a wall
              would turn the sign-up path we just opened into a different dead end. */}
          <p className="signin-form__account-note">
            {labels.skipHint} <a href={next}>{labels.skip}</a>
          </p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="verify-code">{labels.code}</label>
          <input
            id="verify-code"
            type="text"
            inputMode="numeric"
            // Lets both mobile browsers offer the code straight from the SMS notification.
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <small className="field__hint">{labels.codeHint}</small>
          <button
            className="btn btn--primary signin-form__submit"
            type="button"
            onClick={() => void confirmCode()}
            disabled={pending}
          >
            {labels.confirm}
          </button>
          <button
            className="btn btn--outline btn--block verify-phone-form__secondary"
            type="button"
            onClick={() => setStep('phone')}
            disabled={pending}
          >
            {labels.resend}
          </button>
        </div>
      )}

      {/* Firebase mounts the invisible reCAPTCHA here. It must exist before sendCode runs. */}
      <div id="recaptcha-container" />
    </section>
  );
}

/**
 * Turns a Firebase error into something a person can act on.
 *
 * Firebase codes are precise and unreadable. Anything unrecognised falls through to a generic
 * message rather than being shown raw — "auth/internal-error-encountered" tells a shopkeeper
 * nothing and looks like the platform is broken.
 */
function errorKeyFor(caught: unknown): keyof Labels {
  const code = (caught as { code?: string })?.code ?? '';

  if (code.includes('invalid-phone-number')) return 'invalidPhone';
  if (code.includes('invalid-verification-code')) return 'invalidCode';
  if (code.includes('too-many-requests')) return 'tooManyAttempts';

  return 'failed';
}
