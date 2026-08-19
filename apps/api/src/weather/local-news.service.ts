import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** One local news headline, display-only, linking back to the publisher. */
export interface NewsHeadline {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&') // last, so it does not double-decode the entities above
    .trim();
}

function firstMatch(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  return match ? decodeEntities(match[1] ?? '') : null;
}

/**
 * Parse a Google News RSS feed into headlines. Pure and exported so it can be tested without a
 * network call. Google News titles read "Headline - Publisher"; the `<source>` tag names the
 * publisher, so the " - Publisher" suffix is trimmed off the title to avoid the repetition.
 */
export function parseNewsRss(xml: string, limit: number): NewsHeadline[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const headlines: NewsHeadline[] = [];
  for (const item of items) {
    const rawTitle = firstMatch(item, 'title');
    const url = firstMatch(item, 'link');
    if (!rawTitle || !url) continue;
    const source = firstMatch(item, 'source') ?? '';
    const pubDate = firstMatch(item, 'pubDate');
    let publishedAt: string | null = null;
    if (pubDate) {
      const parsed = new Date(pubDate);
      if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
    }
    const suffix = source ? ` - ${source}` : '';
    const title =
      suffix && rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length) : rawTitle;
    headlines.push({ title, url, source, publishedAt });
    if (headlines.length >= limit) break;
  }
  return headlines;
}

/**
 * "Local Now" news — live local headlines for the viewer's area, pulled on demand and cached in
 * Redis for a short window, never stored (docs/LIVE_LOCAL_DATA_PLAN.md). Source is Google News
 * RSS: key-free, India-localised, published for syndication. Display-only — headline + publisher
 * + a link back to the original; never the article body. Any failure degrades to an empty list so
 * the section simply hides.
 */
@Injectable()
export class LocalNewsService {
  private readonly logger = new Logger(LocalNewsService.name);
  private static readonly TTL_SECONDS = 1800; // 30 minutes — news changes on the order of hours
  private static readonly USER_AGENT = 'LocZ/1.0 (https://locz.in; support@locz.in)';

  constructor(private readonly redis: RedisService) {}

  async headlines(query: string, limit = 6): Promise<NewsHeadline[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const key = `news:${trimmed.toLowerCase()}`;
    const cached = await this.redis.getJson<NewsHeadline[]>(key);
    if (cached) return cached;

    try {
      // India-localised English news for the area query; `ceid` pins the edition.
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
        `${trimmed} when:2d`,
      )}&hl=en-IN&gl=IN&ceid=IN:en`;
      const response = await fetch(url, {
        headers: { 'User-Agent': LocalNewsService.USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return [];
      const headlines = parseNewsRss(await response.text(), limit);
      if (headlines.length > 0) {
        await this.redis.setJson(key, headlines, LocalNewsService.TTL_SECONDS);
      }
      return headlines;
    } catch (error) {
      this.logger.warn(`News fetch failed for "${trimmed}": ${(error as Error).message}`);
      return [];
    }
  }
}
