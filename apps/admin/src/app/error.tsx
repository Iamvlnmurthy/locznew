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
  useEffect(() => {
    reportClientError(error, 'error_boundary');
    // A chunk that 404s means this tab is still running a build that a deploy has since replaced
    // (its chunk filenames no longer exist). A one-time full reload fetches the current build and
    // recovers silently. A 10s time-guard prevents a reload loop if the chunk is genuinely broken,
    // while still allowing recovery from a later deploy in the same session.
    const message = `${error?.name ?? ''} ${error?.message ?? ''}`;
    const isChunkError =
      /ChunkLoadError|Loading chunk|Failed to load chunk|error loading dynamically imported module/i.test(
        message,
      );
    if (!isChunkError) return;
    try {
      const KEY = 'locz-chunk-reload-at';
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [error]);

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
          <button className="btn btn--primary" type="button" onClick={reset}>
            Retry
          </button>
          <Link className="btn btn--ghost" href="/">
            Console home
          </Link>
        </div>
        {error.digest ? <code style={{ marginTop: 20 }}>{error.digest}</code> : null}
      </section>
    </main>
  );
}
