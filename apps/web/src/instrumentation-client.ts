import { reportClientError } from '@/lib/client-observability';

window.addEventListener('error', (event) => {
  reportClientError(event.error ?? event.message, 'window_error');
});

window.addEventListener('unhandledrejection', (event) => {
  reportClientError(event.reason, 'unhandled_rejection');
});
