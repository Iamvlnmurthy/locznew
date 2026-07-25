import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { ListingsService } from '../src/listings/listings.service';
import { ModerationService } from '../src/moderation/moderation.service';
import { AuthService } from '../src/auth/auth.service';
import { MediaService } from '../src/media/media.service';

/**
 * Compiles the real module graph with only the two external connections stubbed.
 *
 * This catches what `tsc` cannot: a provider that is never exported, a token with no
 * binding, a circular import. Those surface at boot in production and nowhere earlier,
 * so they are worth one fast test.
 */
describe('AppModule wiring', () => {
  // Environment comes from test/setup-env.ts — it must be in place before imports.

  it('resolves every provider without a live database or cache', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([]),
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(RedisService)
      .useValue({
        client: {},
        incrementWithWindow: jest.fn().mockResolvedValue(1),
        ping: jest.fn().mockResolvedValue(true),
        del: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .compile();

    // Touching one service per feature module proves the whole chain resolved, not just
    // that compile() returned.
    expect(moduleRef.get(AuthService)).toBeDefined();
    expect(moduleRef.get(ListingsService)).toBeDefined();
    expect(moduleRef.get(ModerationService)).toBeDefined();
    expect(moduleRef.get(MediaService)).toBeDefined();

    await moduleRef.close();
  });
});
