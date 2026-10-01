import { AppConfig } from '../src/config/config.module';
import { SitemapNotifyService } from '../src/seo/sitemap-notify.service';

/**
 * This ping is entirely optional -- the site behaved correctly before it existed, and must
 * keep behaving correctly for every operator who never sets GOOGLE_SEARCH_CONSOLE_KEY. These
 * cases pin that it never throws into the news/listing pipelines that call it, regardless of
 * whether credentials are missing, malformed, or simply not yet provisioned.
 */
describe('SitemapNotifyService', () => {
  function build(key?: string) {
    const config = { get: jest.fn().mockReturnValue(key) } as unknown as AppConfig;
    return new SitemapNotifyService(config);
  }

  it('is a silent no-op with no key configured', async () => {
    const service = build(undefined);

    // notify() is fire-and-forget; nothing to await, so this just proves it doesn't throw
    // synchronously -- the real assertion is that the pipeline calling it is never blocked.
    expect(() => service.notify('news-sitemap.xml')).not.toThrow();
  });

  it('does not throw when the configured key is not valid JSON', async () => {
    const service = build('this is not json');

    expect(() => service.notify('sitemap-listings.xml')).not.toThrow();
    // Let the swallowed rejection inside notify() settle before the test exits.
    await new Promise((resolve) => setImmediate(resolve));
  });
});
