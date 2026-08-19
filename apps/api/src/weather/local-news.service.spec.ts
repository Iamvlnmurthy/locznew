import { parseNewsRss } from './local-news.service';

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Hyderabad - Google News</title>
  <item>
    <title>Metro line to Madhapur opens next week - The Hindu</title>
    <link>https://news.google.com/rss/articles/AAA</link>
    <guid isPermaLink="false">AAA</guid>
    <pubDate>Tue, 19 Aug 2026 06:30:00 GMT</pubDate>
    <source url="https://www.thehindu.com">The Hindu</source>
  </item>
  <item>
    <title>Rain &amp; traffic snarl near Gachibowli &#39;junction&#39; - Times of India</title>
    <link>https://news.google.com/rss/articles/BBB</link>
    <pubDate>Tue, 19 Aug 2026 05:00:00 GMT</pubDate>
    <source url="https://timesofindia.com">Times of India</source>
  </item>
</channel></rss>`;

describe('parseNewsRss', () => {
  it('extracts headlines with source and iso date', () => {
    const items = parseNewsRss(SAMPLE, 6);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'Metro line to Madhapur opens next week',
      url: 'https://news.google.com/rss/articles/AAA',
      source: 'The Hindu',
      publishedAt: '2026-08-19T06:30:00.000Z',
    });
  });

  it('trims the " - Publisher" suffix off the title', () => {
    const second = parseNewsRss(SAMPLE, 6)[1]!;
    expect(second.title).toBe("Rain & traffic snarl near Gachibowli 'junction'");
    expect(second.source).toBe('Times of India');
  });

  it('decodes HTML entities in the title', () => {
    const second = parseNewsRss(SAMPLE, 6)[1]!;
    expect(second.title).toContain('&');
    expect(second.title).not.toContain('&amp;');
  });

  it('respects the limit', () => {
    expect(parseNewsRss(SAMPLE, 1)).toHaveLength(1);
  });

  it('returns nothing for a feed with no items', () => {
    expect(parseNewsRss('<rss><channel></channel></rss>', 6)).toEqual([]);
  });
});
