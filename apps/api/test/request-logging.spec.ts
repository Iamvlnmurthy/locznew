import { CallHandler, ExecutionContext, Logger, NotFoundException } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from '../src/common/interceptors/request-logging.interceptor';

function context(url: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        url,
        path: url.split('?')[0],
        correlationId: 'correlation-123',
        user: { id: 'user-1' },
      }),
      getResponse: () => ({ statusCode: 200 }),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('RequestLoggingInterceptor', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs a structured completion without query strings', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const interceptor = new RequestLoggingInterceptor();

    await firstValueFrom(
      interceptor.intercept(context('/search?q=private words'), {
        handle: () => of({ ok: true }),
      } as CallHandler),
    );

    const logged = log.mock.calls[0]?.[0];
    expect(logged).toEqual(expect.any(String));
    const event = JSON.parse(String(logged)) as Record<string, unknown>;
    expect(event).toMatchObject({
      level: 'info',
      event: 'http_request',
      method: 'GET',
      route: '/search',
      status: 200,
      correlationId: 'correlation-123',
      userId: 'user-1',
    });
    expect(JSON.stringify(event)).not.toContain('private words');
    expect(event.durationMs).toEqual(expect.any(Number));
  });

  it('records expected HTTP failures at their real status', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const interceptor = new RequestLoggingInterceptor();

    await expect(
      firstValueFrom(
        interceptor.intercept(context('/missing'), {
          handle: () => throwError(() => new NotFoundException()),
        } as CallHandler),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const logged = log.mock.calls[0]?.[0];
    expect(logged).toEqual(expect.any(String));
    expect(JSON.parse(String(logged))).toMatchObject({
      level: 'info',
      route: '/missing',
      status: 404,
    });
  });
});
