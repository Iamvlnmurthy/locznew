import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';
import { Icon } from '@/components/icons';
import { AdSlot } from '@/components/ad-slot';
import { apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';
import { getMessageGroup } from '@/i18n';
import { relativeTime } from '@/lib/relative-time';
import { NewsFilters } from './news-filters';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const n = getMessageGroup(await getLocale(), 'newsUi');
  return { title: n.metadataTitle, description: n.metadataDescription };
}

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
const NEWS_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'the',
  'to',
  'with',
]);

function headlineTokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase('en-IN')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !NEWS_STOP_WORDS.has(token)),
  );
}

function dedupeStories(stories: StoryCard[]): StoryCard[] {
  const accepted: Array<{ story: StoryCard; tokens: Set<string> }> = [];
  for (const story of stories) {
    const tokens = headlineTokens(story.title);
    const duplicate = accepted.some(({ story: previous, tokens: priorTokens }) => {
      if (story.category !== previous.category || !tokens.size || !priorTokens.size) return false;
      const overlap = [...tokens].filter((token) => priorTokens.has(token)).length;
      return overlap / Math.min(tokens.size, priorTokens.size) >= 0.62;
    });
    if (!duplicate) accepted.push({ story, tokens });
  }
  return accepted.map(({ story }) => story);
}

type NewsQuery = Record<string, string | undefined>;

function qs(base: NewsQuery, changes: NewsQuery) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...changes })) if (v) p.set(k, v);
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
  const n = getMessageGroup(locale, 'newsUi');
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
  // Different publishers frequently syndicate the same incident under lightly rewritten
  // headlines. Keep the newest card and avoid presenting those copies as separate local events.
  const cards = dedupeStories(feed?.cards ?? []);
  const hasMore = feed?.hasMore ?? false;
  const base = { topic, when, lang: lang === 'en' ? undefined : lang };
  const cityName = city?.name ?? null;

  return (
    <main className="news-page">
      <header className="news-masthead news-masthead--compact">
        <div className="container news-masthead__inner">
          <div className="news-masthead__copy">
            <span className="news-masthead__brand">
              <Icon name="location" /> {n.mastheadBrand}
            </span>
            <h1>{cityName ? n.aroundCity.replace('{city}', cityName) : n.happeningNearYou}</h1>
            <p>{n.intro}</p>
          </div>
          <div className="news-masthead__signal" aria-label={n.liveFeed}>
            <span className="news-masthead__pulse" aria-hidden="true" />
            <span>
              <strong>{n.liveDesk}</strong>
              <small>{n.latestFirst}</small>
            </span>
          </div>
        </div>
      </header>

      <NewsFilters
        lang={lang}
        when={when}
        topic={topic}
        dates={facets?.dates ?? { today: 0, yesterday: 0, week: 0, month: 0 }}
        topics={facets?.topics ?? []}
        resultCount={cards.length}
        cityName={cityName}
        labels={n}
      />

      <div className="container news-feed">
        {cards.length === 0 ? (
          <div className="news-feed__empty">
            <span className="news-feed__empty-icon" aria-hidden="true">
              <Icon name="sparkles" />
            </span>
            <strong>{n.emptyTitle}</strong>
            <p>{n.emptyBody}</p>
            <Link href="/news">{n.showAll}</Link>
          </div>
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
                      <Image
                        src={s.imageUrl}
                        alt={s.title}
                        fill
                        priority={i === 0}
                        sizes={
                          i === 0
                            ? '(max-width: 760px) 100vw, 66vw'
                            : '(max-width: 760px) 100vw, 33vw'
                        }
                      />
                      {s.imageCredit ? (
                        <small className="news-card__credit">
                          {n.photoCredit.replace('{credit}', s.imageCredit)}
                        </small>
                      ) : null}
                    </span>
                  ) : (
                    <span className="news-card__img news-card__img--empty" aria-hidden="true">
                      <Icon name="image" />
                    </span>
                  )}
                  <span className="news-card__body">
                    {i === 0 ? <span className="news-card__top-story">{n.topStory}</span> : null}
                    <span className="news-card__meta">
                      <span className="news-card__cat">{s.category}</span>
                      <span className="news-card__ring">{n[s.ring]}</span>
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
                    <span className="news-card__read">
                      {n.readStory} <Icon name="arrow" />
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
          <nav className="news-pagination" aria-label={n.moreNews}>
            {page > 1 ? (
              <Link
                className="news-pagination__link news-pagination__link--prev"
                href={qs(base, { page: String(page - 1) })}
              >
                <Icon name="arrow" /> {n.newer}
              </Link>
            ) : (
              <span />
            )}
            <span className="news-pagination__page">{n.page.replace('{page}', String(page))}</span>
            {hasMore ? (
              <Link className="news-pagination__link" href={qs(base, { page: String(page + 1) })}>
                {n.older} <Icon name="arrow" />
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
