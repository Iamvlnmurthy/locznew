'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { reportClientError } from '@/lib/client-observability';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => reportClientError(error, 'error_boundary'), [error]);

  return (
    <main className="login-shell">
      <section className="login-card" style={{ textAlign: 'center' }}>
        <p className="eyebrow">Operations interrupted</p>
        <h1>That view couldn’t be loaded.</h1>
        <p className="muted">
          Retry the request. If it happens again, share the support reference with the platform
          team.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button className="button button--primary" type="button" onClick={reset}>
            Retry
          </button>
          <Link className="button" href="/">
            Console home
          </Link>
        </div>
        {error.digest ? <code style={{ marginTop: 20 }}>{error.digest}</code> : null}
      </section>
    </main>
  );
}
