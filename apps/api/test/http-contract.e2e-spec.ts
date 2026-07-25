import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { makePrismaMock, makeRedisMock } from './factories';

/**
 * End-to-end foundation.
 *
 * Boots the real HTTP stack — guards, pipes, interceptors, exception filter — with only
 * PostgreSQL and Redis stubbed. That covers the contract every client depends on:
 * authentication defaults, validation behaviour, and the response envelope.
 *
 * It deliberately stops short of database behaviour. Once Docker is available, the
 * companion suite in docs/ACCEPTANCE.md exercises that against a real PostGIS instance;
 * duplicating it here with mocks would test the mocks, not the system.
 */
describe('HTTP contract (e2e)', () => {
  let app: INestApplication;
  const prisma = makePrismaMock();
  const redis = makeRedisMock();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        ...prisma,
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(RedisService)
      .useValue({ ...redis, onModuleDestroy: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();

    // Mirrors main.ts — an e2e suite that configures the app differently from production
    // proves nothing about production.
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        validationError: { target: false, value: false },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('authentication defaults', () => {
    it('rejects an unauthenticated request to a protected route', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'Unauthorized' },
      });
    });

    it('rejects a malformed bearer token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('allows a public route with no token at all', async () => {
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    });

    it('allows public browsing of listings without signing in', async () => {
      await request(app.getHttpServer()).get('/api/v1/listings').expect(200);
    });
  });

  describe('response envelope', () => {
    it('wraps success in { success, data }', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({ status: 'ok' });
    });

    it('returns a correlation id and echoes it in the header', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .set('x-correlation-id', 'test-correlation-123')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBe('test-correlation-123');
      expect(response.body.correlationId).toBe('test-correlation-123');
    });

    it('generates a correlation id when the client sends none', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

      expect(response.headers['x-correlation-id']).toMatch(/[0-9a-f-]{36}/);
    });
  });

  describe('validation', () => {
    it('rejects a non-Indian mobile number with a useful message', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+15551234567' })
        .expect(400);

      expect(response.body.error.message).toContain('valid Indian mobile number');
    });

    it('rejects a number in the wrong format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '9876543210' }) // missing +91
        .expect(400);
    });

    it('rejects unknown properties rather than silently ignoring them', async () => {
      // forbidNonWhitelisted: a client sending isAdmin:true must be told no, not have it
      // quietly dropped.
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+919876543210', isAdmin: true })
        .expect(400);

      expect(response.body.error.message).toMatch(/isAdmin/);
    });

    it('rejects a missing required field', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({}).expect(400);
    });

    it('returns every validation failure in details, so a form can flag each field', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login/email')
        .send({ email: 'not-an-email', password: 'x' })
        .expect(400);

      expect(Array.isArray(response.body.error.details)).toBe(true);
      expect(response.body.error.details.length).toBeGreaterThan(1);
    });
  });

  describe('errors', () => {
    it('returns a 404 in the standard envelope', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

      expect(response.body).toMatchObject({ success: false, error: { code: 'NotFound' } });
      expect(response.body.path).toBe('/api/v1/does-not-exist');
      expect(response.body.timestamp).toBeDefined();
    });

    it('never leaks a stack trace to the client', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');

      expect(JSON.stringify(response.body)).not.toMatch(/at .+\.ts:\d+/);
    });
  });

  describe('versioning', () => {
    it('serves under /api/v1', async () => {
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    });

    it('does not serve unversioned paths', async () => {
      await request(app.getHttpServer()).get('/api/health/live').expect(404);
    });
  });
});
