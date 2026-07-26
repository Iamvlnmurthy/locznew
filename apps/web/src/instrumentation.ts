import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String(error.digest)
      : undefined;

  console.error(
    JSON.stringify({
      level: 'error',
      event: 'next_server_error',
      service: 'locz-web',
      message: normalized.message.slice(0, 500),
      digest,
      method: request.method,
      path: request.path.split('?')[0],
      route: context.routePath,
      routeType: context.routeType,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    }),
  );
};
