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

  /**
   * Data-health snapshot for the admin dashboard (plan Parts 36–37): the source registry plus
   * how much local inventory exists and how much of it is claimed — the numbers that answer
   * "is this locality ready?".
   */
  async coverage(): Promise<{
    sources: Array<DataSource & { runnable: boolean }>;
    businesses: { total: number; byClaimStatus: Record<string, number> };
    topCities: Array<{ name: string; count: number }>;
    topCategories: Array<{ name: string; count: number }>;
  }> {
    const where = { deletedAt: null };
    const [sources, total, byStatus, byCity, byCategory] = await Promise.all([
      this.list(),
      this.prisma.business.count({ where }),
      this.prisma.business.groupBy({ by: ['claimStatus'], where, _count: { _all: true } }),
      this.prisma.business.groupBy({
        by: ['cityId'],
        where,
        _count: { _all: true },
        orderBy: { _count: { cityId: 'desc' } },
        take: 10,
      }),
      this.prisma.business.groupBy({
        by: ['categoryId'],
        where,
        _count: { _all: true },
        orderBy: { _count: { categoryId: 'desc' } },
        take: 10,
      }),
    ]);

    const [cities, categories] = await Promise.all([
      this.prisma.city.findMany({
        where: { id: { in: byCity.map((r) => r.cityId) } },
        select: { id: true, name: true },
      }),
      this.prisma.category.findMany({
        where: { id: { in: byCategory.map((r) => r.categoryId) } },
        select: { id: true, name: true },
      }),
    ]);
    const cityName = new Map(cities.map((c) => [c.id, c.name]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));

    return {
      sources: sources.map((source) => ({ ...source, runnable: sourceMayRunInProduction(source) })),
      businesses: {
        total,
        byClaimStatus: Object.fromEntries(byStatus.map((r) => [r.claimStatus, r._count._all])),
      },
      topCities: byCity.map((r) => ({ name: cityName.get(r.cityId) ?? '—', count: r._count._all })),
      topCategories: byCategory.map((r) => ({
        name: categoryName.get(r.categoryId) ?? '—',
        count: r._count._all,
      })),
    };
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
