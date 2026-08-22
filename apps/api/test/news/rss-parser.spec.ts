import { parseFeed } from '../../src/news/ingest/rss.parser';

/**
 * The shared feed parser is the ingestion front door — every source flows through it. It must
 * survive real-world feed sloppiness (CDATA, entities, malformed items, mixed languages) and
 * never throw, because one bad item must not lose a whole poll.
 */
describe('parseFeed', () => {
  it('parses an RSS item: title, link, summary, source, image, ISO date', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title><![CDATA[Heavy rain floods Gachibowli - The Hindu]]></title>
        <link>https://example.com/a</link>
        <guid>guid-1</guid>
        <description>&lt;p&gt;Waterlogging reported across Gachibowli &amp; Kondapur.&lt;/p&gt;</description>
        <pubDate>Mon, 20 Apr 2026 06:30:00 GMT</pubDate>
        <source url="https://thehindu.com">The Hindu</source>
        <enclosure url="https://cdn.example.com/flood.jpg" type="image/jpeg"/>
      </item>
    </channel></rss>`;
    const [item] = parseFeed(xml);
    expect(item.title).toBe('Heavy rain floods Gachibowli'); // " - The Hindu" suffix trimmed
    expect(item.link).toBe('https://example.com/a');
    expect(item.guid).toBe('guid-1');
    expect(item.summary).toBe('Waterlogging reported across Gachibowli & Kondapur.');
    expect(item.source).toBe('The Hindu');
    expect(item.imageUrl).toBe('https://cdn.example.com/flood.jpg');
    expect(item.publishedAt).toBe('2026-04-20T06:30:00.000Z');
  });

  it('keeps Telugu content intact and decodes numeric entities', () => {
    const xml = `<rss><channel><item>
      <title>మాదాపూర్‌లో భారీ వర్షం</title>
      <link>https://te.example.com/x</link>
      <description>గచ్చిబౌలి &#8211; హైదరాబాద్</description>
    </item></channel></rss>`;
    const [item] = parseFeed(xml);
    expect(item.title).toBe('మాదాపూర్‌లో భారీ వర్షం');
    expect(item.summary).toContain('గచ్చిబౌలి');
    expect(item.summary).toContain('–'); // &#8211; → en dash
  });

  it('parses an Atom entry (link href, summary, image via media:thumbnail)', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Power cut in Kukatpally</title>
        <link rel="alternate" href="https://example.com/atom"/>
        <id>atom-1</id>
        <summary>Scheduled maintenance</summary>
        <published>2026-04-20T04:00:00Z</published>
        <media:thumbnail url="https://cdn.example.com/t.jpg"/>
        <category term="utility"/>
      </entry>
    </feed>`;
    const [item] = parseFeed(xml);
    expect(item.title).toBe('Power cut in Kukatpally');
    expect(item.link).toBe('https://example.com/atom');
    expect(item.guid).toBe('atom-1');
    expect(item.imageUrl).toBe('https://cdn.example.com/t.jpg');
    expect(item.categories).toEqual(['utility']);
  });

  it('skips a malformed item without throwing, keeping the good ones', () => {
    const xml = `<rss><channel>
      <item><title>No link here</title></item>
      <item><title>Good one</title><link>https://example.com/g</link></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Good one');
  });

  it('extracts a body <img> when no media/enclosure is present', () => {
    const xml = `<rss><channel><item>
      <title>Traffic diversion at Hitec City</title>
      <link>https://example.com/i</link>
      <description>&lt;img src="https://cdn.example.com/body.jpg"/&gt;Diversion in effect</description>
    </item></channel></rss>`;
    const [item] = parseFeed(xml);
    expect(item.imageUrl).toBe('https://cdn.example.com/body.jpg');
  });

  it('honours the limit and returns [] for empty/garbage input', () => {
    const xml = `<rss><channel>${'<item><title>t</title><link>https://e/x</link></item>'.repeat(5)}</channel></rss>`;
    expect(parseFeed(xml, 2)).toHaveLength(2);
    expect(parseFeed('')).toEqual([]);
    expect(parseFeed('not xml at all')).toEqual([]);
  });
});
