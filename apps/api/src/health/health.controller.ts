import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../rbac/rbac.decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: is the process up. Deliberately touches no dependency. */
  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: string; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  /**
   * Readiness: can this instance serve traffic. Checks the dependencies whose absence
   * would make every request fail, so the proxy stops routing to it instead of
   * returning 500s.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async ready(): Promise<{ status: string; checks: Record<string, boolean> }> {
    const [database, cache] = await Promise.all([this.checkDatabase(), this.redis.ping()]);
    const checks = { database, redis: cache };

    if (!database || !cache) {
      throw new ServiceUnavailableException({ status: 'degraded', checks });
    }

    return { status: 'ok', checks };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
