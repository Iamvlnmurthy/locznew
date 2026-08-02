'use client';

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { googleSignInAction, type GoogleSignInState } from './actions';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback(response: GoogleCredentialResponse): void;
      }): void;
      renderButton(
        element: HTMLElement,
        options: {
          type: 'standard';
          theme: 'outline' | 'filled_black';
          size: 'large';
          shape: 'pill';
          text: 'continue_with';
          logo_alignment: 'left';
          width: number;
        },
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let googleIdentityPromise: Promise<GoogleIdentity> | null = null;

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google) return Promise.resolve(window.google);
  if (googleIdentityPromise) return googleIdentityPromise;

  googleIdentityPromise = new Promise<GoogleIdentity>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-locz-google-identity]');
    const script = existing ?? document.createElement('script');

    const loaded = () => {
      if (window.google) resolve(window.google);
      else reject(new Error('Google Identity Services did not initialize'));
    };
    const failed = () => reject(new Error('Google Identity Services could not be loaded'));

    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });

    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.dataset.loczGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleIdentityPromise = null;
    throw error;
  });

  return googleIdentityPromise;
}

interface Labels {
  divider: string;
  button: string;
  unavailable: string;
  failed: string;
}

export function GoogleSignIn({
  clientId,
  next,
  labels,
}: {
  clientId: string;
  next: string;
  labels: Labels;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [state, action, pending] = useActionState<GoogleSignInState, FormData>(
    googleSignInAction,
    {},
  );

  const handleCredential = useCallback(
    (response: GoogleCredentialResponse) => {
      if (!response.credential) return;
      const data = new FormData();
      data.set('idToken', response.credential);
      data.set('next', next);
      startTransition(() => action(data));
    },
    [action, next],
  );

  useEffect(() => {
    let active = true;
    loadGoogleIdentity().then(
      () => {
        if (active) setScriptReady(true);
      },
      () => {
        if (active) setScriptFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const google = window.google;
    const container = buttonRef.current;
    if (!scriptReady || !google || !container) return;

    google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });

    const render = () => {
      container.replaceChildren();
      google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'left',
        width: Math.min(400, Math.max(240, Math.round(container.clientWidth))),
      });
    };

    render();
    window.addEventListener('resize', render);
    const theme = new MutationObserver(render);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      window.removeEventListener('resize', render);
      theme.disconnect();
    };
  }, [clientId, handleCredential, scriptReady]);

  const message = scriptFailed
    ? labels.unavailable
    : state.error
      ? { unavailable: labels.unavailable, failed: labels.failed }[state.error]
      : null;

  return (
    <section className="google-signin" aria-label={labels.button} aria-busy={pending}>
      <div className="google-signin__divider">
        <span />
        <p>{labels.divider}</p>
        <span />
      </div>
      {message ? (
        <p className="signin-form__error google-signin__error" role="alert">
          {message}
        </p>
      ) : null}
      {!scriptFailed ? (
        <div ref={buttonRef} className={`google-signin__button${pending ? ' is-pending' : ''}`} />
      ) : null}
    </section>
  );
}
