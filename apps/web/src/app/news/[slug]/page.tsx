import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { apiSafe, SITE_URL } from '@/lib/api';
import { getLocale } from '@/lib/session';

// LocZ-regenerated news event. Content is OUR OWN rewrite (no redirect to the source publisher);
// original outlets are credited at the foot of the article for attribution only.
interface NewsEvent {
  slug: string;
  title: string;
  summary: string | null;
  categories: string[];
  publishedAt: string | null;
  locz: boolean;
  sources: Array<{ publisher: string | null; url: string | null }>;
}

async function loadEvent(slug: string, lang: string): Promise<NewsEvent | null> {
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
  return {
    title: `${event.title} | LocZ News`,
    description,
    alternates: { canonical },
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

        {event.summary ? (
          <div className="news-article__body">
            {event.summary
              .split(/\n{2,}/)
              .map((para, i) => (para.trim() ? <p key={i}>{para.trim()}</p> : null))}
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
      </div>
    </main>
  );
}
