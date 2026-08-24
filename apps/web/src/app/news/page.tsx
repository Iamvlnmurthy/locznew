import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { Icon } from '@/components/icons';
import { AdSlot } from '@/components/ad-slot';
import { apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';

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
// Literal labels for now; the news surface is localised in a later i18n pass.
const WHEN_LABEL: Record<(typeof WHENS)[number], string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  month: 'This month',
};
const RING_LABEL: Record<StoryCard['ring'], string> = {
  local: 'Local',
  city: 'City',
  district: 'District',
  state: 'State',
  national: 'India',
};
const LANGS: Array<{ code: string; label: string; te?: boolean }> = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'తెలుగు', te: true },
  { code: 'hi', label: 'हिन्दी' },
];

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
      <header className="news-masthead">
        <div className="container">
          <span className="news-masthead__brand">
            <Icon name="location" /> LocZ News · Hyperlocal
          </span>
          <h1>What’s happening near you</h1>
          <p>
            Local news in your area, rewritten in LocZ’s own voice and translated into your
            language.
          </p>
          <nav className="news-langs" aria-label="Language">
            {LANGS.map((l) => (
              <Link
                key={l.code}
                href={qs(base, { lang: l.code === 'en' ? undefined : l.code })}
                className={`news-lang${(base.lang ?? 'en') === l.code ? ' news-lang--on' : ''}${l.te ? ' te' : ''}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="news-filters">
        <div className="container">
          <div className="news-filters__row">
            <span className="news-filters__label">When</span>
            {WHENS.map((w) => (
              <Link
                key={w}
                href={qs(base, { when: when === w ? undefined : w })}
                className={`news-pill${when === w ? ' news-pill--on' : ''}`}
              >
                {WHEN_LABEL[w]}
                {facets ? <b>{facets.dates[w]}</b> : null}
              </Link>
            ))}
          </div>
          <div className="news-filters__row">
            <span className="news-filters__label">Topic</span>
            <Link
              href={qs(base, { topic: undefined })}
              className={`news-chip${!topic ? ' news-chip--on' : ''}`}
            >
              All
            </Link>
            {(facets?.topics ?? []).map((tp) => (
              <Link
                key={tp.key}
                href={qs(base, { topic: topic === tp.key ? undefined : tp.key })}
                className={`news-chip${topic === tp.key ? ' news-chip--on' : ''}`}
              >
                <span className="news-chip__cap">{tp.key}</span>
                <b>{tp.count}</b>
              </Link>
            ))}
          </div>
        </div>
      </div>

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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
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
