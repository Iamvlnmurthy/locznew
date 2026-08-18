import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { AppConfig } from './config/config.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(AppConfig);
  const logger = new Logger('Bootstrap');

  /**
   * Trust the reverse proxy's `X-Forwarded-For`.
   *
   * Without this Express reports the socket address, which behind Nginx is the proxy itself —
   * identical for every request on the platform. `infrastructure/nginx/proxy_params_locz` sets
   * the header and says why it matters, and the API was silently ignoring it: the global
   * throttler, the OTP per-IP ceiling and the idempotency scope all collapsed into a single
   * bucket, so the 120-requests-a-minute limit was a platform-wide ceiling rather than a
   * per-client one, and every audit row recorded the proxy's address.
   *
   * `1` rather than `true`: exactly one proxy sits in front of this, so only the last hop is
   * trusted. `true` would honour a client-supplied `X-Forwarded-For`, which turns a per-IP
   * limit into a header anybody can rewrite.
   */
  app.set('trust proxy', 1);

  // Secure headers. CSP is left to Nginx and the Next.js apps — the API serves JSON,
  // and a CSP here would only duplicate policy in a second place.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  const corsOrigins = config.get('CORS_ORIGINS');
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Correlation-Id'],
  });

  app.setGlobalPrefix(config.get('API_GLOBAL_PREFIX'));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties instead of trusting them
      forbidNonWhitelisted: true, // and reject the request that sent them
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  // Swagger is served in every environment except production, where publishing the
  // full API surface is an unnecessary disclosure.
  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('LocZ API')
        .setDescription(
          'Location-first local discovery platform. All responses are wrapped in ' +
            '`{ success, data }`; errors use `{ success: false, error: { code, message } }`.',
        )
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
        .addServer(config.get('API_BASE_URL'))
        .addTag('auth', 'Mobile OTP and optional email sign-in')
        .addTag('users', 'Profiles, devices and account lifecycle')
        .addTag('health', 'Liveness and readiness probes')
        .build(),
    );
    SwaggerModule.setup(`${config.get('API_GLOBAL_PREFIX')}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();

  const port = config.get('API_PORT');
  await app.listen(port, '0.0.0.0');

  logger.log(`LocZ API listening on port ${port}`);
  logger.log(`OTP provider: ${config.get('OTP_PROVIDER')}`);
  if (!config.isProduction) {
    logger.log(`Swagger: ${config.get('API_BASE_URL')}/${config.get('API_GLOBAL_PREFIX')}/docs`);
  }
}

void bootstrap();
