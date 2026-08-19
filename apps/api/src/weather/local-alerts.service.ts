import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** One official public-safety alert, verbatim from the source, display-only. */
export interface LocalAlert {
  title: string;
  category: string | null;
  publishedAt: string | null;
}

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? decode(m[1] ?? '') : null;
}

/** Parse the NDMA SACHET all-India CAP RSS into alerts. Pure — tested without a network call. */
export function parseAlertsRss(xml: string): LocalAlert[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const alerts: LocalAlert[] = [];
  for (const item of items) {
    const title = tag(item, 'title');
    if (!title) continue;
    const pubDate = tag(item, 'pubDate');
    let publishedAt: string | null = null;
    if (pubDate) {
      const parsed = new Date(pubDate);
      if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
    }
    alerts.push({ title, category: tag(item, 'category'), publishedAt });
  }
  return alerts;
}

/**
 * Keep only the alerts whose text names the viewer's area. CAP titles embed the affected place
 * ("...over Telangana"), so a case-insensitive match on the city (and any extra region terms)
 * is what scopes an all-India feed down to "near me".
 */
export function filterAlertsByArea(
  alerts: LocalAlert[],
  terms: string[],
  limit: number,
): LocalAlert[] {
  const needles = terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3);
  if (needles.length === 0) return [];
  return alerts
    .filter((alert) => {
      const haystack = alert.title.toLowerCase();
      return needles.some((needle) => haystack.includes(needle));
    })
    .slice(0, limit);
}

/**
 * "Local Now" alerts — official public-safety warnings for the viewer's area from NDMA SACHET
 * (India's CAP integrated alert system): key-free, official, and shown verbatim + labelled, never
 * reworded (per the Data Engine plan). The all-India feed is fetched once and cached, then filtered
 * per city in memory. Any failure degrades to an empty list so the section simply hides.
 */
@Injectable()
export class LocalAlertsService {
  private readonly logger = new Logger(LocalAlertsService.name);
  private static readonly TTL_SECONDS = 900; // 15 minutes
  private static readonly FEED_URL =
    'https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml';
  private static readonly USER_AGENT = 'LocZ/1.0 (https://locz.in; support@locz.in)';

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /** The area terms for a city — its own name plus its district and state, so a state-level CAP
   * warning ("over Telangana") reaches a Hyderabad viewer. Falls back to just the given name. */
  async areaTermsForCity(cityId: string | undefined, fallbackName: string): Promise<string[]> {
    if (!cityId) return [fallbackName];
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: {
        name: true,
        state: { select: { name: true } },
        district: { select: { name: true } },
      },
    });
    if (!city) return [fallbackName];
    return [city.name, city.district?.name, city.state?.name].filter(
      (value): value is string => !!value,
    );
  }

  private async allIndia(): Promise<LocalAlert[]> {
    const key = 'alerts:india';
    const cached = await this.redis.getJson<LocalAlert[]>(key);
    if (cached) return cached;
    try {
      const response = await fetch(LocalAlertsService.FEED_URL, {
        headers: { 'User-Agent': LocalAlertsService.USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return [];
      const alerts = parseAlertsRss(await response.text());
      if (alerts.length > 0) await this.redis.setJson(key, alerts, LocalAlertsService.TTL_SECONDS);
      return alerts;
    } catch (error) {
      this.logger.warn(`Alerts fetch failed: ${(error as Error).message}`);
      return [];
    }
  }

  async forArea(terms: string[], limit = 4): Promise<LocalAlert[]> {
    return filterAlertsByArea(await this.allIndia(), terms, limit);
  }
}
