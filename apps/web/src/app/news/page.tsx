import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { Icon } from '@/components/icons';
import { AdSlot } from '@/components/ad-slot';
import { apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';
import { relativeTime } from '@/lib/relative-time';
import { NewsFilters } from './news-filters';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'LocZ News — what’s happening near you',
  description:
    'Hyperlocal news for your area, rewritten in LocZ’s own voice and translated into your language — filter by topic, date and place.',
};

interface StoryCard {
  id: string;
  slug: string;
  category: string;
  title: string;
  dek: string | null;
  summary: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  city: string | null;
  state: string | null;
  distanceKm: number | null;
  ring: 'local' | 'city' | 'district' | 'state' | 'national';
  publishedAt: string | null;
}
interface Facets {
  topics: { key: string; count: number }[];
  languages: string[];
  dates: { today: number; yesterday: number; week: number; month: number };
}

const WHENS = ['today', 'yesterday', 'week', 'month'] as const;
const RING_LABEL: Record<StoryCard['ring'], string> = {
  local: 'Local',
  city: 'City',
  district: 'District',
  state: 'State',
  national: 'India',
};

function qs(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/news?${s}` : '/news';
}

export default async function NewsFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; when?: string; lang?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const [locale, city] = await Promise.all([getLocale(), getSelectedCity()]);
  const lang = sp.lang || locale || 'en';
  const when = WHENS.includes(sp.when as (typeof WHENS)[number]) ? sp.when : undefined;
  const topic = sp.topic;
  const PER_PAGE = 24;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);

  const q = new URLSearchParams({
    limit: String(PER_PAGE),
    offset: String((page - 1) * PER_PAGE),
    lang,
    // Latest first. Without this the feed defaults to nearest-first when a location is set, which
    // buries just-published stories under older-but-closer ones — a news feed should lead with what's
    // new. The per-card distance ring still gives location context.
    sort: 'recent',
  });
  if (topic) q.set('category', topic);
  if (when) q.set('when', when);
  if (city?.latitude && city?.longitude) {
    q.set('latitude', String(city.latitude));
    q.set('longitude', String(city.longitude));
  }

  const [feed, facets] = await Promise.all([
    apiSafe<{ cards: StoryCard[]; hasMore: boolean }>(`/news/stories?${q.toString()}`, {
      revalidate: 120,
    }),
    apiSafe<Facets>('/news/stories/facets', { revalidate: 300 }),
  ]);
  const cards = feed?.cards ?? [];
  const hasMore = feed?.hasMore ?? false;
  const base = { topic, when, lang: lang === 'en' ? undefined : lang };

  return (
    <main className="news-page">
      <header className="news-masthead news-masthead--compact">
        <div className="container">
          <span className="news-masthead__brand">
            <Icon name="location" /> LocZ News · Hyperlocal
          </span>
          <h1>What’s happening near you</h1>
        </div>
      </header>

      <NewsFilters
        lang={lang}
        when={when}
        topic={topic}
        dates={facets?.dates ?? { today: 0, yesterday: 0, week: 0, month: 0 }}
        topics={facets?.topics ?? []}
      />

      <div className="container news-feed">
        {cards.length === 0 ? (
          <p className="news-feed__empty">
            No stories yet for this filter — try a wider date range or topic.
          </p>
        ) : (
          <div className="news-grid">
            {cards.map((s, i) => (
              <Fragment key={s.id}>
                <Link
                  href={`/news/${s.slug}${lang !== 'en' ? `?lang=${lang}` : ''}`}
                  className={`news-card${i === 0 ? ' news-card--lead' : ''}`}
                >
                  {s.imageUrl ? (
                    <span className="news-card__img">
                      <img src={s.imageUrl} alt="" loading="lazy" />
                      {s.imageCredit ? (
                        <small className="news-card__credit">Photo: {s.imageCredit}</small>
                      ) : null}
                    </span>
                  ) : null}
                  <span className="news-card__body">
                    <span className="news-card__meta">
                      <span className="news-card__cat">{s.category}</span>
                      <span className="news-card__ring">{RING_LABEL[s.ring]}</span>
                      {relativeTime(s.publishedAt, lang) ? (
                        <time className="news-card__time" dateTime={s.publishedAt ?? undefined}>
                          {relativeTime(s.publishedAt, lang)}
                        </time>
                      ) : null}
                    </span>
                    <span className={`news-card__title${lang === 'te' ? ' te' : ''}`}>
                      {s.title}
                    </span>
                    <span className={`news-card__dek${lang === 'te' ? ' te' : ''}`}>
                      {s.dek ?? s.summary}
                    </span>
                  </span>
                </Link>
                {i === 4 ? (
                  <AdSlot placement="NEWS_FEED_IN_LIST" contentScore={cards.length} />
                ) : null}
              </Fragment>
            ))}
          </div>
        )}

        {cards.length > 0 && (page > 1 || hasMore) ? (
          <nav className="news-pagination" aria-label="More news">
            {page > 1 ? (
              <Link
                className="news-pagination__link news-pagination__link--prev"
                href={qs(base, { page: String(page - 1) })}
              >
                <Icon name="arrow" /> Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="news-pagination__page">Page {page}</span>
            {hasMore ? (
              <Link className="news-pagination__link" href={qs(base, { page: String(page + 1) })}>
                Older <Icon name="arrow" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
