import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { apiSafe, SITE_URL } from '@/lib/api';
import { getLocale, localizedAlternates } from '@/lib/session';
import { AdSlot } from '@/components/ad-slot';

// LocZ-regenerated news event. Content is OUR OWN rewrite (no redirect to the source publisher);
// original outlets are credited at the foot of the article for attribution only.
interface NewsEvent {
  slug: string;
  title: string;
  summary: string | null;
  /** Present on the regenerated news_stories surface; legacy events remain summary-only. */
  body?: string | null;
  categories: string[];
  publishedAt: string | null;
  locz: boolean;
  sources: Array<{ publisher: string | null; url: string | null }>;
}

interface NewsStory {
  id: string;
  category: string;
  title: string;
  dek: string | null;
  body: string | null;
  publishedAt: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadEvent(slug: string, lang: string): Promise<NewsEvent | null> {
  // The regenerated news_stories engine uses UUIDs and carries a proper article body. Keep
  // legacy event slugs working during migration, but never manufacture body copy from a summary.
  if (UUID.test(slug)) {
    const story = await apiSafe<NewsStory>(
      `/news/stories/${encodeURIComponent(slug)}?lang=${encodeURIComponent(lang)}`,
      { revalidate: 300 },
    );
    if (story) {
      return {
        slug: story.id,
        title: story.title,
        summary: story.dek ?? story.body?.split(/\n{2,}/)[0]?.slice(0, 240) ?? null,
        body: story.body,
        categories: [story.category],
        publishedAt: story.publishedAt,
        locz: true,
        sources: [],
      };
    }
  }
  return apiSafe<NewsEvent>(`/news/${encodeURIComponent(slug)}?lang=${encodeURIComponent(lang)}`, {
    revalidate: 300,
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const event = await loadEvent(slug, locale);
  if (!event) return { title: 'News' };
  const description = event.summary?.slice(0, 160) ?? event.title;
  const canonical = `${SITE_URL}/news/${event.slug}`;
  const alternates = await localizedAlternates(`/news/${event.slug}`);
  return {
    title: `${event.title} | LocZ News`,
    description,
    alternates,
    openGraph: { title: event.title, description, url: canonical, type: 'article' },
  };
}

export const dynamic = 'force-dynamic';

export default async function NewsEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = getTranslator(locale);
  const event = await loadEvent(slug, locale);
  if (!event) notFound();

  const published = event.publishedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(event.publishedAt),
      )
    : null;
  const articleText = event.body?.trim() || event.summary?.trim() || '';
  const paragraphs = articleText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const wordCount = articleText ? articleText.split(/\s+/).filter(Boolean).length : 0;

  return (
    <main className="news-article-page">
      <div className="container news-article">
        <Link href="/discover/news" className="news-article__back">
          <Icon name="arrow" /> {t('discoveryAreas.news')}
        </Link>

        <div className="news-article__meta">
          {event.categories.slice(0, 3).map((c) => (
            <span key={c} className="news-article__tag">
              {c}
            </span>
          ))}
          {published ? <time>{published}</time> : null}
        </div>

        <h1 className="news-article__title">{event.title}</h1>

        <AdSlot placement="NEWS_ARTICLE_TOP" contentScore={wordCount} />

        {paragraphs.length > 0 ? (
          <div className="news-article__body">
            {paragraphs.map((paragraph, index) => (
              <Fragment key={`${index}-${paragraph.slice(0, 24)}`}>
                <p>{paragraph}</p>
                {index === 1 ? (
                  <AdSlot placement="NEWS_ARTICLE_IN_BODY" contentScore={wordCount} />
                ) : null}
              </Fragment>
            ))}
          </div>
        ) : null}

        <p className="news-article__byline">{'LocZ News'}</p>

        {event.sources.length > 0 ? (
          <footer className="news-article__sources">
            <small>{t('discoverUi.sourcesLabel')}</small>
            <ul>
              {event.sources.map((s, i) => (
                <li key={`${s.url ?? s.publisher ?? i}`}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="nofollow noopener noreferrer">
                      {s.publisher ?? s.url}
                    </a>
                  ) : (
                    (s.publisher ?? '')
                  )}
                </li>
              ))}
            </ul>
          </footer>
        ) : null}

        <AdSlot placement="NEWS_ARTICLE_RELATED" contentScore={wordCount} />
      </div>
    </main>
  );
}
