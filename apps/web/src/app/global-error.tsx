'use client';

/**
 * Custom global error boundary.
 *
 * Next's built-in `/_global-error` page fails to prerender in this app ("Cannot read properties
 * of null (reading 'useContext')"), which aborts `next build` and leaves an incomplete `.next`.
 * Providing our own minimal client boundary makes the page prerender cleanly so the production
 * build completes. It must render its own <html>/<body> because it replaces the root layout.
 */
export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          background: '#0b3d2e',
          color: '#fff',
          textAlign: 'center',
          padding: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ opacity: 0.85, marginBottom: '1.25rem' }}>
            We hit an unexpected error. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: '#ff6f5e',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
