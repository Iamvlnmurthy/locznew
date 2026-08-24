import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type TimeWindow = 'today' | 'yesterday' | 'week' | 'month' | 'all';

export interface StoryFeedQuery {
  latitude?: number;
  longitude?: number;
  category?: string;
  state?: string;
  city?: string;
  when?: TimeWindow;
  lang?: 'en' | 'hi' | 'te' | string;
  limit?: number;
  offset?: number;
}

export interface StoryCard {
  id: string;
  category: string;
  title: string;
  dek: string | null;
  summary: string | null;
  lang: string;
  imageUrl: string | null;
  imageCredit: string | null;
  city: string | null;
  state: string | null;
  distanceKm: number | null;
  ring: 'local' | 'city' | 'district' | 'state' | 'national';
  publishedAt: string | null;
}

/**
 * The LocZ news feed over `news_stories` (the engine's regenerated + translated output).
 *
 * Distance-increasing: stories are ordered nearest-first and the feed fills outward, so a quiet
 * locality still returns a full page by widening into city → district → state → national. The
 * ring label is derived from the distance so the client can show "2 km · Gachibowli" vs "Telangana".
 * Kept on raw SQL because the ring/time logic is a PostGIS distance sort, and the table is
 * intentionally outside Prisma until the shape settles.
 */
@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private sinceClause(when: TimeWindow): string {
    switch (when) {
      case 'today':
        return "published_at >= date_trunc('day', now())";
      case 'yesterday':
        return (
          "published_at >= date_trunc('day', now()) - interval '1 day' " +
          "AND published_at < date_trunc('day', now())"
        );
      case 'week':
        return "published_at >= now() - interval '7 days'";
      case 'month':
        return "published_at >= now() - interval '30 days'";
      default:
        return 'TRUE';
    }
  }

  private pick(row: Record<string, unknown>, lang: string): { title: string; body: string | null } {
    if (lang === 'hi')
      return {
        title: (row.title_hi as string) ?? (row.title_en as string),
        body: row.body_hi as string,
      };
    if (lang === 'te' || row.state_lang === lang)
      return {
        title: (row.title_sl as string) ?? (row.title_en as string),
        body: row.body_sl as string,
      };
    return { title: row.title_en as string, body: row.body_en as string };
  }

  private ring(distanceKm: number | null, sameState: boolean): StoryCard['ring'] {
    if (distanceKm == null) return sameState ? 'state' : 'national';
    if (distanceKm <= 5) return 'local';
    if (distanceKm <= 15) return 'city';
    if (distanceKm <= 50) return 'district';
    return sameState ? 'state' : 'national';
  }

  async feed(q: StoryFeedQuery): Promise<{ cards: StoryCard[]; hasMore: boolean }> {
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 50);
    const offset = Math.max(q.offset ?? 0, 0);
    const lang = q.lang ?? 'en';
    const hasPoint = q.latitude != null && q.longitude != null;

    // Distance in metres from the anchor, or NULL when no point supplied (then order by recency).
    const distSql = hasPoint
      ? `ST_DistanceSphere(ST_MakePoint(longitude, latitude), ST_MakePoint($1, $2))`
      : `NULL::float8`;

    const where: string[] = ["status = 'PUBLISHED'"];
    const params: unknown[] = hasPoint ? [q.longitude, q.latitude] : [];
    const p = () => `$${params.length + 1}`;
    if (q.category) {
      where.push(`category = ${p()}`);
      params.push(q.category);
    }
    if (q.state) {
      where.push(`lower(state) = lower(${p()})`);
      params.push(q.state);
    }
    if (q.city) {
      where.push(`lower(city) = lower(${p()})`);
      params.push(q.city);
    }
    where.push(this.sinceClause(q.when ?? 'all'));

    const order = hasPoint ? 'dist_m ASC NULLS LAST, published_at DESC' : 'published_at DESC';
    const sql = `
      SELECT id, category, title_en, dek_en, title_hi, body_hi, title_sl, body_sl, body_en,
             state_lang, image_url, image_credit, city, state, published_at,
             ${distSql} AS dist_m
      FROM news_stories
      WHERE ${where.join(' AND ')}
      ORDER BY ${order}
      LIMIT ${limit + 1} OFFSET ${offset}`;

    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
    const hasMore = rows.length > limit;
    const cards: StoryCard[] = rows.slice(0, limit).map((row) => {
      const distM = row.dist_m == null ? null : Number(row.dist_m);
      const distanceKm = distM == null ? null : Math.round(distM / 100) / 10;
      const sameState = !!q.state && (row.state as string)?.toLowerCase() === q.state.toLowerCase();
      const { title, body } = this.pick(row, lang);
      return {
        id: row.id as string,
        category: row.category as string,
        title,
        dek: (row.dek_en as string) ?? null,
        summary: body ? (body.split('\n')[0] ?? '').slice(0, 240) : null,
        lang,
        imageUrl: (row.image_url as string) ?? null,
        imageCredit: (row.image_credit as string) ?? null,
        city: (row.city as string) ?? null,
        state: (row.state as string) ?? null,
        distanceKm,
        ring: this.ring(distanceKm, sameState),
        publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : null,
      };
    });
    return { cards, hasMore };
  }

  async byId(id: string, lang = 'en'): Promise<Record<string, unknown> | null> {
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM news_stories WHERE id = $1 AND status = 'PUBLISHED' LIMIT 1`,
      id,
    );
    const row = rows[0];
    if (!row) return null;
    const { title, body } = this.pick(row, lang);
    return {
      id: row.id,
      category: row.category,
      lang,
      title,
      dek: row.dek_en,
      body,
      imageUrl: row.image_url,
      imageCredit: row.image_credit,
      city: row.city,
      state: row.state,
      publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : null,
    };
  }
}
