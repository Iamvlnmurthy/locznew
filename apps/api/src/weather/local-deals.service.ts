import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { RedisService } from '../redis/redis.service';

/**
 * One deal/offer, display-only, linking out to the merchant via the affiliate URL (which is how
 * the redemption earns commission). Never presented as a LocZ-owned listing — it is an aggregated
 * offer "via {merchant}", tapped to redeem at source.
 */
export interface LocalDeal {
  id: string;
  title: string;
  merchant: string;
  description: string;
  couponCode: string | null;
  imageUrl: string | null;
  url: string;
  category: string | null;
  endDate: string | null;
}

interface CuelinksOffer {
  id?: number;
  campaign?: string;
  title?: string;
  description?: string;
  coupon_code?: string;
  image_url?: string;
  url?: string;
  affiliate_url?: string;
  status?: string;
  end_date?: string;
  categories?: Record<string, string>;
}

const CUELINKS_MEDIA = 'https://www.cuelinks.com';

/** Strip HTML/entities from Cuelinks' rich descriptions down to a short plain summary. */
function plain(html: string): string {
  return html
    .replace(/<\/li>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shape only the fields we display; drop expired, non-live, and image-less-placeholder offers. */
export function mapCuelinks(offers: CuelinksOffer[], limit: number): LocalDeal[] {
  const today = new Date().toISOString().slice(0, 10);
  return offers
    .filter((o) => (o.status ?? 'live') === 'live')
    .filter((o) => !o.end_date || o.end_date >= today)
    .filter((o) => o.affiliate_url && o.title)
    .slice(0, limit)
    .map((o) => {
      const image = o.image_url && !o.image_url.includes('missing') ? o.image_url : null;
      return {
        id: String(o.id ?? ''),
        title: (o.title ?? '').trim(),
        merchant: (o.campaign ?? '').trim(),
        description: plain(o.description ?? '').slice(0, 220),
        couponCode: o.coupon_code?.trim() || null,
        imageUrl: image ? (image.startsWith('http') ? image : `${CUELINKS_MEDIA}${image}`) : null,
        url: o.affiliate_url ?? o.url ?? '',
        category: o.categories ? (Object.values(o.categories)[0] ?? null) : null,
        endDate: o.end_date ?? null,
      };
    });
}

/**
 * "Local Now" deals — live affiliate offers pulled on demand and cached in Redis for a short
 * window, never stored (docs/LIVE_LOCAL_DATA_PLAN.md). Source is the Cuelinks Publisher API, gated
 * on CUELINKS_API_KEY — off (returns []) when the key is absent, so the Deals surface simply hides.
 * These are aggregated national offers linking out to the merchant to redeem; they are deliberately
 * NOT presented as location-specific or as LocZ-owned listings.
 */
@Injectable()
export class LocalDealsService {
  private readonly logger = new Logger(LocalDealsService.name);
  private static readonly TTL_SECONDS = 3600; // 1 hour — offers turn over on the order of days
  private static readonly USER_AGENT = 'LocZ/1.0 (https://locz.in; support@locz.in)';

  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  private get apiKey(): string | null {
    return this.config.get('CUELINKS_API_KEY')?.trim() || null;
  }

  async list(limit = 24): Promise<LocalDeal[]> {
    const apiKey = this.apiKey;
    if (!apiKey) return [];

    const key = `deals:cuelinks:${limit}`;
    const cached = await this.redis.getJson<LocalDeal[]>(key);
    if (cached) return cached;

    try {
      // Over-fetch so filtering out expired/non-live still leaves a full page.
      const url = `https://www.cuelinks.com/api/v2/offers.json?per_page=${Math.min(limit * 3, 100)}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Token token="${apiKey}"`,
          'User-Agent': LocalDealsService.USER_AGENT,
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return [];
      const body = (await response.json()) as { offers?: CuelinksOffer[] };
      const deals = mapCuelinks(body.offers ?? [], limit);
      if (deals.length > 0) await this.redis.setJson(key, deals, LocalDealsService.TTL_SECONDS);
      return deals;
    } catch (error) {
      this.logger.warn(`Deals fetch failed: ${(error as Error).message}`);
      return [];
    }
  }
}
