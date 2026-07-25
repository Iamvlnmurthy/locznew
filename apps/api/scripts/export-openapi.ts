/**
 * Writes the OpenAPI document to docs/openapi.json without a database, a queue or a
 * listening server.
 *
 *   npm run openapi -w @locz/api
 *
 * Committing the document means an API change shows up as a diff in review — a removed
 * field or a changed enum becomes visible rather than something a client discovers at
 * runtime. It is also what an external consumer needs to generate their own client.
 *
 * PrismaService and RedisService are stubbed for the same reason the tests stub them:
 * creating the Nest application runs `onModuleInit`, and generating documentation must
 * not require infrastructure to be up.
 */
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import 'reflect-metadata';

process.env.NODE_ENV ??= 'development';
process.env.DATABASE_URL ??= 'postgresql://locz:locz@localhost:5432/locz?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'openapi-export-placeholder-secret-value-32ch';
process.env.JWT_REFRESH_SECRET ??= 'openapi-export-placeholder-secret-value-32ch';
process.env.SCHEDULER_ENABLED ??= 'false';

// Imported after the environment is set: the config module validates at import time.
/* eslint-disable @typescript-eslint/no-require-imports */
const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
const { PrismaService } =
  require('../src/prisma/prisma.service') as typeof import('../src/prisma/prisma.service');
const { RedisService } =
  require('../src/redis/redis.service') as typeof import('../src/redis/redis.service');
/* eslint-enable @typescript-eslint/no-require-imports */

const noop = (): void => undefined;

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ $connect: noop, $disconnect: noop, onModuleInit: noop, onModuleDestroy: noop })
    .overrideProvider(RedisService)
    .useValue({ client: {}, ping: noop, onModuleDestroy: noop })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('LocZ API')
      .setDescription(
        'Location-first local discovery platform. Successful responses are wrapped in ' +
          '`{ success, data }`; errors use `{ success: false, error: { code, message } }`.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addServer('http://localhost:4000', 'Local development')
      .addServer('https://locz.in', 'Production')
      .build(),
  );

  const outputPath = resolve(__dirname, '../../../docs/openapi.json');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const pathCount = Object.keys(document.paths ?? {}).length;
  const schemaCount = Object.keys(document.components?.schemas ?? {}).length;
  console.log(`Wrote ${pathCount} paths and ${schemaCount} schemas to ${outputPath}`);

  await app.close();
}

main().catch((error: unknown) => {
  console.error('Could not export the OpenAPI document:');
  console.error(error);
  // Set the code rather than calling process.exit, which truncates buffered output on
  // Windows and hides the very error being reported.
  process.exitCode = 1;
});
