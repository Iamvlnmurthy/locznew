import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';

export interface ErrorContext {
  correlationId?: string;
  userId?: string;
  route?: string;
  method?: string;
  extra?: Record<string, unknown>;
}

/**
 * Sentry-compatible error reporting over the plain Store endpoint.
 *
 * Deliberately not the `@sentry/node` SDK: it pulls in a large dependency tree and
 * auto-instruments everything, and the brief asks only for a Sentry-*compatible*
 * integration. The envelope format below is understood by Sentry itself and by
 * self-hosted alternatives such as GlitchTip — which matters for an India-first product
 * where data residency may rule out the hosted service.
 *
 * With no DSN configured this is a no-op, so local development reports nothing.
 */
@Injectable()
export class ErrorReporter {
  private readonly logger = new Logger(ErrorReporter.name);
  private readonly endpoint: string | null;
  private readonly publicKey: string | null;

  /** Field names whose values are never transmitted. */
  private static readonly SCRUB = [
    'password',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'code',
    'otp',
    'secret',
    'apiKey',
  ];

  constructor(private readonly config: AppConfig) {
    const dsn = config.get('SENTRY_DSN');

    if (!dsn) {
      this.endpoint = null;
      this.publicKey = null;
      return;
    }

    try {
      // DSN form: https://<publicKey>@<host>/<projectId>
      const parsed = new URL(dsn);
      const projectId = parsed.pathname.replace('/', '');
      this.publicKey = parsed.username;
      this.endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`;
      this.logger.log(`Error reporting enabled (${parsed.host})`);
    } catch {
      // A malformed DSN must not stop the API booting — monitoring is not load-bearing.
      this.logger.warn('SENTRY_DSN is not a valid DSN; error reporting is disabled');
      this.endpoint = null;
      this.publicKey = null;
    }
  }

  get isEnabled(): boolean {
    return this.endpoint !== null;
  }

  /**
   * Fire-and-forget. Reporting must never delay or fail the request it describes, so
   * the promise is intentionally not awaited by callers and every error is swallowed.
   */
  capture(error: unknown, context: ErrorContext = {}): void {
    if (!this.endpoint || !this.publicKey) return;

    const payload = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: 'node',
      level: 'error',
      logger: 'locz-api',
      environment: this.config.get('SENTRY_ENVIRONMENT'),
      server_name: 'locz-api',
      transaction: context.route,
      exception: {
        values: [
          {
            type: error instanceof Error ? error.name : 'Error',
            value: error instanceof Error ? error.message : String(error),
            stacktrace: this.parseStack(error),
          },
        ],
      },
      tags: {
        correlation_id: context.correlationId ?? 'none',
        method: context.method ?? 'unknown',
      },
      // Only the id — never the phone number, name or email of the affected user.
      user: context.userId ? { id: context.userId } : undefined,
      extra: this.scrub(context.extra ?? {}),
    };

    void fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': [
          'Sentry sentry_version=7',
          'sentry_client=locz/1.0',
          `sentry_key=${this.publicKey}`,
        ].join(', '),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    }).catch((sendError: unknown) => {
      this.logger.debug(
        `Could not report error: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
      );
    });
  }

  private parseStack(
    error: unknown,
  ): { frames: Array<{ filename: string; function: string; lineno: number }> } | undefined {
    if (!(error instanceof Error) || !error.stack) return undefined;

    const frames = error.stack
      .split('\n')
      .slice(1)
      .map((line) => /at (?:(.+?) )?\(?(.+?):(\d+):\d+\)?/.exec(line.trim()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({
        function: match[1] ?? '<anonymous>',
        filename: match[2] ?? 'unknown',
        lineno: Number(match[3] ?? 0),
      }))
      // Sentry expects oldest frame first.
      .reverse();

    return frames.length > 0 ? { frames } : undefined;
  }

  private scrub(input: Record<string, unknown>): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      const isSensitive = ErrorReporter.SCRUB.some((field) =>
        key.toLowerCase().includes(field.toLowerCase()),
      );

      if (isSensitive) {
        output[key] = '[redacted]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        output[key] = this.scrub(value as Record<string, unknown>);
      } else {
        output[key] = value;
      }
    }

    return output;
  }
}
