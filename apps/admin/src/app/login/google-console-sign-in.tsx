'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { googleLoginAction } from './actions';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (r: { credential: string }) => void }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

/**
 * Signing in to the console with Google.
 *
 * Deliberately does not call `prompt()` — One Tap auto-triggers on page load, and on the
 * public site that produces an error before the visitor has done anything. A console is not
 * a place to surprise somebody; the button waits to be pressed.
 *
 * The credential goes straight to the server action. Nothing here decides whether the account
 * may use the console: the API verifies Google's signature, and the role check runs after.
 */
export function GoogleConsoleSignIn({ clientId }: { clientId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onCredential = useCallback(async (response: { credential: string }) => {
    const result = await googleLoginAction(response.credential);
    // A successful sign-in redirects, so anything returned here is a refusal.
    if (result?.error) setError(result.error);
  }, []);

  useEffect(() => {
    if (!clientId || !container.current) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const google = (window as unknown as { google?: GoogleIdentity }).google;
      if (!google || !container.current) return;

      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => void onCredential(response),
      });
      google.accounts.id.renderButton(container.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: 320,
      });
    };

    document.head.appendChild(script);
    return () => script.remove();
  }, [clientId, onCredential]);

  if (!clientId) return null;

  return (
    <div className="google-console-signin">
      {error ? <p role="alert">{error}</p> : null}
      <div ref={container} />
    </div>
  );
}
