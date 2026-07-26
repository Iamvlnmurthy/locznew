type ClientErrorSource = 'error_boundary' | 'window_error' | 'unhandled_rejection';

function safeMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value);
  return raw.replace(/https?:\/\/([^\s?]+)\?[^\s]+/g, 'https://$1?[redacted]').slice(0, 500);
}

export function reportClientError(error: unknown, source: ClientErrorSource): void {
  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: crypto.randomUUID(),
      source,
      message: safeMessage(error),
      path: window.location.pathname,
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => undefined);
}
