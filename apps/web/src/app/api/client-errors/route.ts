import { NextRequest } from 'next/server';

export async function POST(request: NextRequest): Promise<Response> {
  if (request.headers.get('sec-fetch-site') !== 'same-origin') {
    return new Response(null, { status: 403 });
  }

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 4096) return new Response(null, { status: 413 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.message !== 'string' || typeof body.source !== 'string') {
    return new Response(null, { status: 400 });
  }

  console.error(
    JSON.stringify({
      level: 'error',
      event: 'next_client_error',
      service: 'locz-web',
      eventId: String(body.eventId ?? '').slice(0, 64),
      source: body.source.slice(0, 32),
      message: body.message.slice(0, 500),
      path: typeof body.path === 'string' ? body.path.split('?')[0].slice(0, 300) : '/',
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    }),
  );

  return new Response(null, { status: 204 });
}
