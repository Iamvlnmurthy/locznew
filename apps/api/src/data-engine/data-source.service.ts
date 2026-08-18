import { Injectable } from '@nestjs/common';
import { Prisma, DataSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The licence gate (plan Part 51): a source may only run in production once its terms have
 * been reviewed and commercial use is permitted. Storage-bearing sources additionally need
 * storage permission. Pure so it is trivially testable and impossible to bypass by accident.
 */
export function sourceMayRunInProduction(source: DataSource): boolean {
  if (!source.enabled || !source.termsReviewed || !source.commercialUse) return false;
  // POI/business seed data is stored; realtime feeds (weather/alerts) are displayed, not stored.
  const storesData = !['WEATHER', 'ALERT'].includes(source.type);
  if (storesData && !source.storagePermitted) return false;
  return true;
}

@Injectable()
export class DataSourceService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<DataSource[]> {
    return this.prisma.dataSource.findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }] });
  }

  findByKey(key: string): Promise<DataSource | null> {
    return this.prisma.dataSource.findUnique({ where: { key } });
  }

  create(data: Prisma.DataSourceCreateInput): Promise<DataSource> {
    return this.prisma.dataSource.create({ data });
  }

  update(id: string, data: Prisma.DataSourceUpdateInput): Promise<DataSource> {
    return this.prisma.dataSource.update({ where: { id }, data });
  }

  /** Sources cleared to actually ingest right now. */
  async runnable(): Promise<DataSource[]> {
    const all = await this.list();
    return all.filter(sourceMayRunInProduction);
  }

  async recordSuccess(id: string, created: number, updated: number): Promise<void> {
    await this.prisma.dataSource.update({
      where: { id },
      data: {
        lastSuccessAt: new Date(),
        errorCount: 0,
        health: 'HEALTHY',
        requestCount: { increment: 1 },
        recordsCreated: { increment: created },
        recordsUpdated: { increment: updated },
      },
    });
  }

  async recordFailure(id: string, error: string): Promise<void> {
    const source = await this.prisma.dataSource.update({
      where: { id },
      data: {
        lastFailureAt: new Date(),
        errorCount: { increment: 1 },
        requestCount: { increment: 1 },
        reviewNotes: error.slice(0, 500),
      },
    });
    await this.prisma.dataSource.update({
      where: { id },
      data: { health: source.errorCount >= 5 ? 'FAILING' : 'DEGRADED' },
    });
  }
}
