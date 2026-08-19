import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** A LocZ discovery area and how many known places fall in it near the viewer. */
export interface AreaCount {
  area: string;
  count: number;
}

/**
 * Maps a top-level catalog category name to one of the LocZ discovery areas. Regex on the name
 * (not the id/slug) keeps it robust to exact slug values and to new leaf categories — the same
 * approach the web card uses to pick artwork. Order matters: specific buckets before generic.
 */
export function categoryNameToArea(name: string): string | null {
  const value = name.toLowerCase();
  if (/grocer|fruit|vegetable|dairy|bakery|meat|fish|poultry|food/.test(value)) return 'food';
  if (/health|beauty|cosmetic|personal care|pharma|medical|clinic/.test(value)) return 'health';
  if (/vehicle|auto|car|bike|motor/.test(value)) return 'mobility';
  if (/sport|fitness|outdoor|gym/.test(value)) return 'play';
  if (/\bpet/.test(value)) return 'pets';
  if (/job|recruit|career|hiring/.test(value)) return 'jobs';
  if (/event|wedding/.test(value)) return 'events';
  if (/real estate|rental|property/.test(value)) return 'rentals';
  if (/offer|deal/.test(value)) return 'deals';
  if (/hardware|tool|building|farm|garden|agricultur|industrial|business suppl/.test(value))
    return 'home';
  if (
    /electronic|clothing|footwear|furniture|kitchen|toys|book|station|musical|hobby|religious|festive/.test(
      value,
    )
  )
    return 'shopping';
  if (/service/.test(value)) return 'services';
  if (/business/.test(value)) return 'businesses';
  return null;
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
