'use client';

import { useRouter } from 'next/navigation';

const WHENS = ['today', 'yesterday', 'week', 'month'] as const;
const WHEN_LABEL: Record<(typeof WHENS)[number], string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  month: 'This month',
};
const LANGS: Array<{ code: string; label: string; te?: boolean }> = [
  { code: 'en', label: 'EN' },
  { code: 'te', label: 'తెలుగు', te: true },
  { code: 'hi', label: 'हिन्दी' },
];

/**
 * Compact one-line news filter bar: language pills + a When and a Topic dropdown, replacing the two
 * wrapping rows of chips that used to push the actual news below the fold. Navigates on change so it
 * stays server-rendered underneath (each choice is still a real, shareable /news?… URL).
 */
export function NewsFilters({
  lang,
  when,
  topic,
  dates,
  topics,
}: {
  lang: string;
  when?: string;
  topic?: string;
  dates: { today: number; yesterday: number; week: number; month: number };
  topics: { key: string; count: number }[];
}) {
  const router = useRouter();

  const go = (patch: Record<string, string | undefined>) => {
    const current: Record<string, string | undefined> = {
      lang: lang === 'en' ? undefined : lang,
      when,
      topic,
    };
    const next = { ...current, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    router.push(s ? `/news?${s}` : '/news');
  };

  return (
    <div className="news-filterbar">
      <div className="container news-filterbar__inner">
        <div className="news-filterbar__langs" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => go({ lang: l.code === 'en' ? undefined : l.code })}
              className={`news-langbtn${(lang || 'en') === l.code ? ' is-on' : ''}${l.te ? ' te' : ''}`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <label className="news-select">
          <span>When</span>
          <select value={when ?? ''} onChange={(e) => go({ when: e.target.value || undefined })}>
            <option value="">All time</option>
            {WHENS.map((w) => (
              <option key={w} value={w}>
                {WHEN_LABEL[w]} ({dates[w]})
              </option>
            ))}
          </select>
        </label>

        <label className="news-select">
          <span>Topic</span>
          <select value={topic ?? ''} onChange={(e) => go({ topic: e.target.value || undefined })}>
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.key} value={t.key}>
                {t.key} ({t.count})
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
