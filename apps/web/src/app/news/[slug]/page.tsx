import type { Metadata } from 'next';
import { cache, Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { apiSafe, SITE_URL } from '@/lib/api';
import { getLocale, localizedAlternates } from '@/lib/session';
import { AdSlot } from '@/components/ad-slot';
import { TrackView } from './track-view';

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
  imageUrl?: string | null;
  imageCredit?: string | null;
  sources: Array<{ publisher: string | null; url: string | null }>;
}

interface NewsStory {
  id: string;
  slug: string;
  category: string;
  title: string;
  dek: string | null;
  body: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  publishedAt: string | null;
}

// Memoised for the request so generateMetadata and the page component share ONE fetch instead of two.
// This matters most on the slow legacy fallback below: a Telugu NewsEvent regenerates via the LLM
// (~7s), and calling it twice per view doubled the wait.
const loadEvent = cache(async (slug: string, lang: string): Promise<NewsEvent | null> => {
  // The regenerated news_stories engine carries a proper article body, image and translations, and
  // resolves by slug or id. Try it first for every slug; fall back to a legacy NewsEvent otherwise.
  const story = await apiSafe<NewsStory>(
    `/news/stories/${encodeURIComponent(slug)}?lang=${encodeURIComponent(lang)}`,
    { revalidate: 300 },
  );
  if (story) {
    return {
      slug: story.slug ?? story.id,
      title: story.title,
      summary: story.dek ?? story.body?.split(/\n{2,}/)[0]?.slice(0, 240) ?? null,
      body: story.body,
      imageUrl: story.imageUrl ?? null,
      imageCredit: story.imageCredit ?? null,
      categories: [story.category],
      publishedAt: story.publishedAt,
      locz: true,
      sources: [],
    };
  }
  return apiSafe<NewsEvent>(`/news/${encodeURIComponent(slug)}?lang=${encodeURIComponent(lang)}`, {
    revalidate: 300,
  });
});

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { lang: langParam } = await searchParams;
  const locale = await getLocale();
  const event = await loadEvent(slug, langParam || locale || 'en');
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

const ART_LANGS: Array<{ code: string; label: string; te?: boolean }> = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'తెలుగు', te: true },
  { code: 'hi', label: 'हिन्दी' },
];

export default async function NewsEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang: langParam } = await searchParams;
  const locale = await getLocale();
  const lang = langParam || locale || 'en';
  const t = getTranslator(locale);
  const event = await loadEvent(slug, lang);
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

  // NewsArticle structured data — what Google News / rich results read. Publisher is LocZ (our own
  // rewrite); no source is claimed as author. Language matches the requested translation.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: event.title.slice(0, 110),
    description: event.summary ?? undefined,
    datePublished: event.publishedAt ?? undefined,
    dateModified: event.publishedAt ?? undefined,
    inLanguage: lang,
    articleSection: event.categories[0],
    image: event.imageUrl ? [event.imageUrl] : undefined,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/news/${event.slug}` },
    author: { '@type': 'Organization', name: 'LocZ', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'LocZ',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/locz-logo.webp` },
    },
  };

  return (
    <main className="news-article-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="container news-article">
        <div className="news-article__top">
          <Link href="/news" className="news-article__back">
            <Icon name="arrow" /> {t('discoveryAreas.news')}
          </Link>
          <nav className="news-article__langs" aria-label="Language">
            {ART_LANGS.map((l) => (
              <Link
                key={l.code}
                href={`/news/${event.slug}${l.code === 'en' ? '' : `?lang=${l.code}`}`}
                className={`news-article__lang${lang === l.code ? ' news-article__lang--on' : ''}${l.te ? ' te' : ''}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="news-article__meta">
          {event.categories.slice(0, 3).map((c) => (
            <span key={c} className="news-article__tag">
              {c}
            </span>
          ))}
          {published ? <time>{published}</time> : null}
        </div>

        <h1 className="news-article__title">{event.title}</h1>
        {event.summary ? <p className="news-article__dek">{event.summary}</p> : null}

        <AdSlot placement="NEWS_ARTICLE_TOP" contentScore={wordCount} />

        {event.imageUrl ? (
          <figure className="news-article__hero">
            <img src={event.imageUrl} alt="" />
            {event.imageCredit ? <figcaption>Photo: {event.imageCredit}</figcaption> : null}
          </figure>
        ) : null}
        <TrackView slug={event.slug} />

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
