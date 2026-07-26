'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Icon } from '@/components/icons';

export function SearchSort({
  value,
  labels: s,
}: {
  value: string;
  labels: Record<string, string>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function update(nextSort: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (nextSort === 'relevance') next.delete('sort');
    else next.set('sort', nextSort);
    next.delete('page');
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <label className={`search-sort${isPending ? ' is-loading' : ''}`}>
      <Icon name="sort" />
      <span>{s.sort}</span>
      <select
        value={value}
        onChange={(event) => update(event.target.value)}
        disabled={isPending}
        aria-label={s.sortResults}
      >
        <option value="relevance">{s.bestMatch}</option>
        <option value="newest">{s.newestFirst}</option>
        <option value="price_asc">{s.priceLowHigh}</option>
        <option value="price_desc">{s.priceHighLow}</option>
        <option value="popular">{s.mostViewed}</option>
        <option value="distance">{s.nearestFirst}</option>
      </select>
    </label>
  );
}
