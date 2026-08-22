import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InMemoryGazetteer,
  resolvePlaces,
  type Gazetteer,
  type PlaceEntry,
  type ResolvedPlace,
} from './location-resolver';

/**
 * Resolves place names in article text to coordinates. Two-tier so it scales past the ~155k
 * localities table:
 *  - CITIES (640, + Telugu/Hindi names) live in an in-memory matcher, rebuilt hourly.
 *  - LOCALITIES are matched by an INDEXED DB lookup on candidate tokens from the text, not by
 *    loading the whole table — so "Gachibowli / Madhapur" resolve precisely without the memory cost.
 * A locality hit (more specific) outranks a city hit.
 */
@Injectable()
export class GazetteerService {
  private readonly logger = new Logger(GazetteerService.name);
  private cityCache: { gaz: Gazetteer; builtAt: number } | null = null;
  private static readonly TTL_MS = 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /** In-memory city gazetteer (small, cached). */
  private async cities(): Promise<Gazetteer> {
    if (this.cityCache && Date.now() - this.cityCache.builtAt < GazetteerService.TTL_MS) {
      return this.cityCache.gaz;
    }
    const rows = await this.prisma.city.findMany({
      select: { id: true, name: true, nameTe: true, nameHi: true, latitude: true, longitude: true },
    });
    const entries: PlaceEntry[] = rows.map((c) => ({
      entityId: c.id,
      entityType: 'CITY',
      name: c.name,
      aliases: [c.nameTe, c.nameHi].filter((v): v is string => !!v),
      lat: Number(c.latitude),
      lng: Number(c.longitude),
    }));
    const gaz = new InMemoryGazetteer(entries);
    this.cityCache = { gaz, builtAt: Date.now() };
    this.logger.log(`City gazetteer built: ${entries.length} cities`);
    return gaz;
  }

  /** Normalised 1- and 2-grams from the text, as locality-name candidates (drops short/noise). */
  private candidateTokens(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && w.length <= 30);
    const grams = new Set<string>();
    for (let i = 0; i < words.length; i++) {
      grams.add(words[i]!);
      if (i + 1 < words.length) grams.add(`${words[i]} ${words[i + 1]}`);
    }
    return [...grams].slice(0, 60);
  }

  /**
   * Resolve every place the text names: city matches from memory + locality matches from an indexed
   * DB lookup. Returns ResolvedPlace[] sorted by confidence (locality first).
   */
  async resolve(text: string): Promise<ResolvedPlace[]> {
    const cityHits = resolvePlaces(text, await this.cities());

    const candidates = this.candidateTokens(text);
    let localityHits: ResolvedPlace[] = [];
    if (candidates.length > 0) {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          latitude: Prisma.Decimal | null;
          longitude: Prisma.Decimal | null;
        }>
      >`
        SELECT "id", "name", "latitude", "longitude"
        FROM "localities"
        WHERE lower("name") IN (${Prisma.join(candidates)})
          AND "isActive" = true
          AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL
        LIMIT 20
      `;
      localityHits = rows.map((r) => ({
        entityId: r.id,
        entityType: 'LOCALITY' as const,
        name: r.name,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        confidence: 90,
      }));
    }

    return [...localityHits, ...cityHits].sort((a, b) => b.confidence - a.confidence);
  }
}
