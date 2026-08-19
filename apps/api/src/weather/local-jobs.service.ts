import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** One local job opening, display-only, linking back to the source posting. */
export interface JobPosting {
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  postedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

interface AdzunaResult {
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url?: string;
  created?: string;
  salary_min?: number;
  salary_max?: number;
}

/** Shape only the fields we display; everything else in the payload is ignored. */
export function mapAdzuna(results: AdzunaResult[], limit: number): JobPosting[] {
  return results.slice(0, limit).map((result) => ({
    title: (result.title ?? '').replace(/<\/?[^>]+>/g, '').trim(),
    company: result.company?.display_name ?? null,
    location: result.location?.display_name ?? null,
    url: result.redirect_url ?? '',
    postedAt: result.created ?? null,
    salaryMin: typeof result.salary_min === 'number' ? Math.round(result.salary_min) : null,
    salaryMax: typeof result.salary_max === 'number' ? Math.round(result.salary_max) : null,
  }));
}

/**
 * "Local Now" jobs — live local openings for the viewer's area, pulled on demand and cached in
 * Redis for a short window, never stored (docs/LIVE_LOCAL_DATA_PLAN.md). Source is the Adzuna
 * Jobs API (India edition), gated on ADZUNA_APP_ID + ADZUNA_APP_KEY — off (returns []) when the
 * credentials are absent, so the section simply hides. Display-only: title, company, location and
 * a link back to the original posting.
 */
@Injectable()
export class LocalJobsService {
  private readonly logger = new Logger(LocalJobsService.name);
  private static readonly TTL_SECONDS = 10800; // 3 hours — jobs turn over on the order of days
  private static readonly USER_AGENT = 'LocZ/1.0 (https://locz.in; support@locz.in)';

  constructor(private readonly redis: RedisService) {}

  private get credentials(): { appId: string; appKey: string } | null {
    const appId = process.env.ADZUNA_APP_ID?.trim();
    const appKey = process.env.ADZUNA_APP_KEY?.trim();
    return appId && appKey ? { appId, appKey } : null;
  }

  async nearby(query: string, limit = 6): Promise<JobPosting[]> {
    const where = query.trim();
    const credentials = this.credentials;
    if (!where || !credentials) return [];

    const key = `jobs:${where.toLowerCase()}`;
    const cached = await this.redis.getJson<JobPosting[]>(key);
    if (cached) return cached;

    try {
      const params = new URLSearchParams({
        app_id: credentials.appId,
        app_key: credentials.appKey,
        results_per_page: String(limit),
        where,
        'content-type': 'application/json',
      });
      const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?${params.toString()}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': LocalJobsService.USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return [];
      const body = (await response.json()) as { results?: AdzunaResult[] };
      const jobs = mapAdzuna(body.results ?? [], limit);
      if (jobs.length > 0) await this.redis.setJson(key, jobs, LocalJobsService.TTL_SECONDS);
      return jobs;
    } catch (error) {
      this.logger.warn(`Jobs fetch failed for "${where}": ${(error as Error).message}`);
      return [];
    }
  }
}
