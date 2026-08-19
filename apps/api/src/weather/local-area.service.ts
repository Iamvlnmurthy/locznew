import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { categoryNameToArea } from '../common/utils/discovery-areas';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** A LocZ discovery area and how many known places fall in it near the viewer. */
export interface AreaCount {
  area: string;
  count: number;
}

/**
 * "Around you" — how many known places sit in each discovery area near the viewer, derived from
 * the POIs LocZ already holds (no external call). This is what makes a brand-new area look alive
 * before any user has posted: "126 food · 38 health · 74 services nearby".
 *
 * It is a rollup of the same directory the map is built from, so it is cached in Redis on a coarse
 * scope key for a short window rather than recomputed per request (plan: freshness by type — a POI
 * count changes over weeks, not seconds).
 */
@Injectable()
export class LocalAreaService {
  private static readonly TTL_SECONDS = 900; // 15 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async summary(scope: { cityId?: string; pincode?: string }): Promise<AreaCount[]> {
    const key = `area-summary:${scope.cityId ?? ''}:${scope.pincode ?? ''}`;
    const cached = await this.redis.getJson<AreaCount[]>(key);
    if (cached) return cached;

    const where: Prisma.BusinessWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(scope.cityId ? { cityId: scope.cityId } : {}),
      ...(scope.pincode ? { pincodeCode: scope.pincode } : {}),
    };

    const [categories, groups] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, parentId: true, name: true } }),
      this.prisma.business.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
    ]);

    const byId = new Map(categories.map((c) => [c.id, c]));
    const rootName = (id: string): string => {
      let current = byId.get(id);
      // Walk to the top of the tree; guard against a cycle with a bounded loop.
      for (let hops = 0; current?.parentId && hops < 12; hops += 1) {
        current = byId.get(current.parentId) ?? current;
        if (!current.parentId) break;
      }
      return current?.name ?? '';
    };

    const totals = new Map<string, number>();
    for (const group of groups) {
      const area = categoryNameToArea(rootName(group.categoryId));
      if (!area) continue;
      totals.set(area, (totals.get(area) ?? 0) + group._count._all);
    }

    const result = [...totals.entries()]
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count);

    await this.redis.setJson(key, result, LocalAreaService.TTL_SECONDS);
    return result;
  }
}
