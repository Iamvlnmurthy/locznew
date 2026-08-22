import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InMemoryGazetteer, type Gazetteer, type PlaceEntry } from './location-resolver';

/**
 * The production gazetteer: builds the news location dictionary from the real City (+ Telugu/Hindi
 * names) and Locality tables so "Gachibowli / గచ్చిబౌలి" resolves to a point. Cached in memory and
 * rebuilt periodically — the dictionary changes slowly. Alias rows (LocationAlias) fold in here too
 * once populated.
 *
 * Note (scale): this is an in-memory matcher, fine for the launch region. When the locality set
 * grows large, move resolution to a DB trigram/FTS query; the `Gazetteer` interface stays the same.
 */
@Injectable()
export class GazetteerService {
  private readonly logger = new Logger(GazetteerService.name);
  private cache: { gaz: Gazetteer; builtAt: number } | null = null;
  private static readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<Gazetteer> {
    if (this.cache && Date.now() - this.cache.builtAt < GazetteerService.TTL_MS) {
      return this.cache.gaz;
    }
    const gaz = await this.build();
    this.cache = { gaz, builtAt: Date.now() };
    return gaz;
  }

  private async build(): Promise<Gazetteer> {
    const [cities, localities] = await Promise.all([
      this.prisma.city.findMany({
        // City latitude/longitude are required columns, so no null filter is needed.
        select: {
          id: true,
          name: true,
          nameTe: true,
          nameHi: true,
          latitude: true,
          longitude: true,
        },
      }),
      this.prisma.locality.findMany({
        where: { latitude: { not: null }, longitude: { not: null }, isActive: true },
        select: { id: true, name: true, cityId: true, latitude: true, longitude: true },
      }),
    ]);

    const entries: PlaceEntry[] = [];
    for (const c of cities) {
      entries.push({
        entityId: c.id,
        entityType: 'CITY',
        name: c.name,
        aliases: [c.nameTe, c.nameHi].filter((v): v is string => !!v),
        lat: Number(c.latitude),
        lng: Number(c.longitude),
      });
    }
    for (const lo of localities) {
      entries.push({
        entityId: lo.id,
        entityType: 'LOCALITY',
        name: lo.name,
        aliases: [],
        cityId: lo.cityId,
        lat: Number(lo.latitude),
        lng: Number(lo.longitude),
      });
    }
    this.logger.log(`Gazetteer built: ${cities.length} cities, ${localities.length} localities`);
    return new InMemoryGazetteer(entries);
  }
}
