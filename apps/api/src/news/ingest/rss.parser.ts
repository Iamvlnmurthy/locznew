/**
 * One shared RSS/Atom parser for the news pipeline.
 *
 * LocZ had two independent hand-rolled feed parsers (`parseNewsRss` in local-news.service and
 * `parseAlertsRss` in local-alerts.service). This is their consolidation, extended with the
 * fields the news cards need — summary and a lead image — and with Atom `<entry>` support.
 *
 * Deliberately regex-based and dependency-free: feeds are small, adversarial, and often
 * slightly malformed, and a streaming XML parser buys little here while adding a dependency.
 * Pure and exported so the whole thing is unit-testable without a network call.
 */

export interface RssItem {
  /** Stable per-feed id: <guid>/<id>, else the link. Used for ingestion idempotency. */
  guid: string;
  title: string;
  link: string;
  /** Plain-text summary (HTML stripped), or null. */
  summary: string | null;
  /** ISO-8601, or null when the feed gives no parseable date. */
  publishedAt: string | null;
  /** Publisher name from <source> (Google News) or <dc:creator>/<author>, else null. */
  source: string | null;
  /** Lead image URL from media:content / media:thumbnail / enclosure / first body <img>. */
  imageUrl: string | null;
  categories: string[];
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&') // last, so it does not double-decode the entities above
    .trim();
}

/** Inner text of the first <tag>…</tag> in block, entity-decoded. */
function tagText(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return match ? decodeEntities(match[1] ?? '') : null;
}

/** Value of `attr` on the first self-closing/opening <tag …>. */
function tagAttr(block: string, tag: string, attr: string): string | null {
  const el = new RegExp(`<${tag}(\\s[^>]*?)/?>`, 'i').exec(block);
  if (!el) return null;
  const m = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'i').exec(el[1] ?? '');
  return m ? decodeEntities(m[1] ?? '') : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Atom <link href="…"> (rel=alternate wins); falls back to any href. */
function atomLink(block: string): string | null {
  const links = block.match(/<link\b[^>]*>/gi) ?? [];
  const alternate = links.find((l) => /rel\s*=\s*"alternate"/i.test(l)) ?? links[0];
  if (!alternate) return null;
  const m = /href\s*=\s*"([^"]*)"/i.exec(alternate);
  return m ? decodeEntities(m[1] ?? '') : null;
}

function extractImage(block: string, summaryHtml: string | null): string | null {
  const media =
    tagAttr(block, 'media:content', 'url') ??
    tagAttr(block, 'media:thumbnail', 'url') ??
    (/(image|img)/i.test(tagAttr(block, 'enclosure', 'type') ?? '')
      ? tagAttr(block, 'enclosure', 'url')
      : null);
  if (media) return media;
  if (summaryHtml) {
    const img = /<img\b[^>]*\bsrc\s*=\s*"([^"]+)"/i.exec(summaryHtml);
    if (img) return decodeEntities(img[1] ?? '');
  }
  return null;
}

function extractCategories(block: string): string[] {
  // Matches both RSS paired <category>text</category> and Atom self-closing <category term="…"/>.
  const cats = block.match(/<category\b[^>]*?(?:\/>|>[\s\S]*?<\/category>)/gi) ?? [];
  const seen = new Set<string>();
  for (const c of cats) {
    const attr = /term\s*=\s*"([^"]*)"/i.exec(c)?.[1]; // Atom
    const inner = tagText(c, 'category'); // RSS
    const value = decodeEntities(inner || attr || '').trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

function parseBlock(block: string, isAtom: boolean): RssItem | null {
  const title = tagText(block, 'title');
  const link = isAtom ? atomLink(block) : tagText(block, 'link');
  if (!title || !link) return null;

  // RSS uses <description>/<content:encoded>; Atom uses <summary>/<content>.
  const summaryHtml =
    tagText(block, 'content:encoded') ??
    tagText(block, 'description') ??
    tagText(block, 'summary') ??
    tagText(block, 'content');
  const summary = summaryHtml ? stripHtml(summaryHtml) || null : null;

  const publishedAt = toIso(
    tagText(block, 'pubDate') ?? tagText(block, 'published') ?? tagText(block, 'updated'),
  );
  const source = tagText(block, 'source') ?? tagText(block, 'dc:creator') ?? null;

  // Google News titles read "Headline - Publisher"; drop that suffix when <source> repeats it.
  const suffix = source ? ` - ${source}` : '';
  const cleanTitle = suffix && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;

  const guid = tagText(block, 'guid') ?? tagText(block, 'id') ?? link;

  return {
    guid,
    title: cleanTitle,
    link,
    summary,
    publishedAt,
    source,
    imageUrl: extractImage(block, summaryHtml),
    categories: extractCategories(block),
  };
}

/**
 * Parse an RSS or Atom feed into structured items. Handles both `<item>` (RSS) and `<entry>`
 * (Atom), CDATA, numeric/named entities, and malformed markup (unparseable items are skipped,
 * never thrown). `limit` caps the number returned (0 or negative = no cap).
 */
export function parseFeed(xml: string, limit = 0): RssItem[] {
  if (!xml) return [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = isAtom
    ? (xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [])
    : (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []);

  const items: RssItem[] = [];
  for (const block of blocks) {
    let item: RssItem | null = null;
    try {
      item = parseBlock(block, isAtom);
    } catch {
      item = null; // one malformed item must never abort the whole feed
    }
    if (item) items.push(item);
    if (limit > 0 && items.length >= limit) break;
  }
  return items;
}
