'use client';

import Link from 'next/link';

const ERROR_TITLE = 'Something went wrong';
const ERROR_BODY = 'We hit an unexpected error. Please try again.';
const RETRY_LABEL = 'Try again';
const HOME_LABEL = 'Go to home';

/**
 * Custom global error boundary.
 *
 * Next's built-in `/_global-error` page fails to prerender in this app ("Cannot read properties
 * of null (reading 'useContext')"), which aborts `next build` and leaves an incomplete `.next`.
 * Providing our own minimal client boundary makes the page prerender cleanly so the production
 * build completes. It must render its own <html>/<body> because it replaces the root layout.
 */
export default function GlobalError({
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
          background: 'radial-gradient(circle at 50% 0%, #e1f0e9, #f7f5ef 48%, #eef4f0)',
          color: '#17332b',
          textAlign: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            width: 'min(460px, 100%)',
            padding: '40px 32px',
            border: '1px solid #d7e2dc',
            borderRadius: '24px',
            background: 'rgba(255,255,255,.92)',
            boxShadow: '0 24px 70px rgba(20,55,44,.12)',
          }}
        >
          <strong style={{ display: 'block', color: '#0b6b58', marginBottom: '22px' }}>LocZ</strong>
          <h1 style={{ fontSize: '1.65rem', margin: '0 0 0.5rem' }}>{ERROR_TITLE}</h1>
          <p style={{ opacity: 0.72, margin: '0 0 1.5rem', lineHeight: 1.6 }}>{ERROR_BODY}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => reset()}
              style={{
                minHeight: '44px',
                background: '#0b6b58',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                padding: '10px 20px',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {RETRY_LABEL}
            </button>
            <Link
              href="/"
              style={{
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '10px 20px',
                border: '1px solid #cddbd4',
                borderRadius: '12px',
                color: '#17332b',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {HOME_LABEL}
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
