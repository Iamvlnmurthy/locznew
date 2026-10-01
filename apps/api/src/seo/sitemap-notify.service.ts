import { Injectable, Logger } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { AppConfig } from '../config/config.module';

const SITE_URL = 'https://locz.in/';
const SCOPE = 'https://www.googleapis.com/auth/webmasters';

// Google re-reads a submitted sitemap on its own schedule; this just asks it to do that
// sooner. It is not per-URL instant indexing (Google's Indexing API, which would do that,
// is restricted by Google's own terms to JobPosting/BroadcastEvent pages -- using it for
// news or classifieds risks the account being flagged, so this project doesn't use it).
//
// Debounced per sitemap file: news ingests every few minutes and listings publish throughout
// the day, and there is nothing to gain from asking Google to re-read the same file every time
// one more URL lands in it a few seconds apart.
const COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Nudges Google to re-read a sitemap sooner after new content publishes.
 *
 * Entirely optional: with no GOOGLE_SEARCH_CONSOLE_KEY configured, every call is a silent
 * no-op and the site behaves exactly as it did before this existed -- Google finds new URLs
 * on its own next pass over the (always-current) sitemap file.
 */
@Injectable()
export class SitemapNotifyService {
  private readonly logger = new Logger(SitemapNotifyService.name);
  private readonly lastNotified = new Map<string, number>();
  private client: JWT | null | undefined; // undefined = not yet resolved, null = not configured

  constructor(private readonly config: AppConfig) {}

  private getClient(): JWT | null {
    if (this.client !== undefined) return this.client;

    const raw = this.config.get('GOOGLE_SEARCH_CONSOLE_KEY')?.trim();
    if (!raw) {
      this.logger.log('No GOOGLE_SEARCH_CONSOLE_KEY set -- sitemap re-read pings disabled');
      this.client = null;
      return null;
    }

    try {
      const key = JSON.parse(raw) as { client_email: string; private_key: string };
      this.client = new JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: [SCOPE],
      });
    } catch (error) {
      this.logger.error(
        `GOOGLE_SEARCH_CONSOLE_KEY is set but not valid service-account JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.client = null;
    }
    return this.client;
  }

  /** Fire-and-forget. A failure here must never affect the content that triggered it. */
  notify(sitemapFile: string): void {
    void this.run(sitemapFile).catch((error) => {
      this.logger.warn(
        `Sitemap re-read ping failed for ${sitemapFile}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async run(sitemapFile: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const last = this.lastNotified.get(sitemapFile) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) return;
    this.lastNotified.set(sitemapFile, Date.now());

    const sitemapUrl = `${SITE_URL}${sitemapFile}`;
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;

    const { token } = await client.getAccessToken();
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Search Console returned ${response.status}: ${await response.text()}`);
    }
    this.logger.log(`Asked Google to re-read ${sitemapFile}`);
  }
}
