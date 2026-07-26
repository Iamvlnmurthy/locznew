'use client';

import type { ListingSummary } from '@locz/shared-types';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { formatPrice } from '@/components/listing-card';
import { setLibrarySaveAction } from './actions';

type LibraryView = 'saved' | 'recent';
type LibraryFilter = 'ALL' | 'PRODUCT' | 'JOB' | 'SERVICE';

export function SavedLibrary({
  initialSaved,
  recentlyViewed,
  labels: d,
}: {
  initialSaved: ListingSummary[];
  recentlyViewed: ListingSummary[];
  labels: Record<string, string>;
}) {
  const filters: Array<{ value: LibraryFilter; label: string }> = [
    { value: 'ALL', label: d.everything },
    { value: 'PRODUCT', label: d.things },
    { value: 'JOB', label: d.jobs },
    { value: 'SERVICE', label: d.services },
  ];
  const [view, setView] = useState<LibraryView>('saved');
  const [filter, setFilter] = useState<LibraryFilter>('ALL');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(initialSaved);
  const [notice, setNotice] = useState<{ listing: ListingSummary; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const source = view === 'saved' ? saved : recentlyViewed;
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return source.filter((listing) => {
      const matchesFilter =
        filter === 'ALL' ||
        listing.type === filter ||
        (filter === 'PRODUCT' && listing.type === 'CLASSIFIED');
      const matchesQuery =
        !normalizedQuery ||
        `${listing.title} ${listing.localityName ?? ''} ${listing.cityName}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, source]);

  function updateSaved(listing: ListingSummary, shouldSave: boolean) {
    setError(null);
    setNotice(null);

    if (shouldSave) {
      setSaved((current) =>
        current.some((item) => item.id === listing.id)
          ? current
          : [{ ...listing, isSaved: true }, ...current],
      );
    } else {
      setSaved((current) => current.filter((item) => item.id !== listing.id));
      setNotice({ listing, message: d.removedSaved });
    }

    startTransition(async () => {
      const result = await setLibrarySaveAction(listing.id, shouldSave);
      if (!result.ok) {
        setSaved((current) => {
          if (shouldSave) return current.filter((item) => item.id !== listing.id);
          return current.some((item) => item.id === listing.id)
            ? current
            : [{ ...listing, isSaved: true }, ...current];
        });
        setNotice(null);
        setError(result.error ?? d.changeFailed);
      }
    });
  }

  function undoRemove() {
    if (!notice) return;
    updateSaved(notice.listing, true);
  }

  const hasActiveFilters = filter !== 'ALL' || query.trim().length > 0;

  return (
    <div className="saved-library">
      <div className="saved-library__intro">
        <div>
          <span className="section-kicker">{d.privateCollection}</span>
          <h2>{d.collectionTitle}</h2>
          <p>{d.collectionBody}</p>
        </div>
        <div className="saved-library__summary" aria-label={d.librarySummary}>
          <span>
            <strong>{saved.length}</strong>
            {d.savedLower}
          </span>
          <i aria-hidden="true" />
          <span>
            <strong>{recentlyViewed.length}</strong>
            {d.recentlyViewedLower}
          </span>
        </div>
      </div>

      <div className="saved-library__toolbar">
        <div className="saved-library__tabs" role="tablist" aria-label={d.libraryView}>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'saved'}
            className={view === 'saved' ? 'is-active' : ''}
            onClick={() => setView('saved')}
          >
            <Icon name="heart" />
            {d.navSaved}
            <span>{saved.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'recent'}
            className={view === 'recent' ? 'is-active' : ''}
            onClick={() => setView('recent')}
          >
            <Icon name="clock" />
            {d.recentlyViewed}
            <span>{recentlyViewed.length}</span>
          </button>
        </div>

        <label className="saved-library__search">
          <span className="sr-only">{d.searchLibrary}</span>
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={d.searchLibraryPlaceholder}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label={d.clearLibrarySearch}>
              ×
            </button>
          ) : null}
        </label>
      </div>

      <div className="saved-library__filters" aria-label={d.filterListingType}>
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? 'is-active' : ''}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="saved-library__context">
        <p>{view === 'saved' ? d.savedPrivate : d.recentTrail}</p>
        <span>{d.resultCount.replace('{count}', String(visible.length))}</span>
      </div>

      {visible.length ? (
        <div className="saved-library__grid" aria-live="polite">
          {visible.map((listing) => {
            const isSaved = saved.some((item) => item.id === listing.id);
            return (
              <LibraryCard
                key={listing.id}
                listing={listing}
                isSaved={isSaved}
                isPending={isPending}
                onSave={() => updateSaved(listing, !isSaved)}
                labels={d}
              />
            );
          })}
        </div>
      ) : (
        <div className="saved-library__empty">
          <img src="/illustrations/empty-neighbourhood.webp" alt="" width={220} height={160} />
          <h3>
            {hasActiveFilters ? d.noMatch : view === 'saved' ? d.collectionReady : d.noRecent}
          </h3>
          <p>
            {hasActiveFilters
              ? d.noMatchBody
              : view === 'saved'
                ? d.collectionReadyBody
                : d.noRecentBody}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => {
                setFilter('ALL');
                setQuery('');
              }}
            >
              {d.clearFilters}
            </button>
          ) : (
            <Link href="/search" className="btn btn--primary">
              {d.exploreNearby} <Icon name="arrow" />
            </Link>
          )}
        </div>
      )}

      {error ? (
        <div className="saved-library__toast saved-library__toast--error" role="alert">
          <Icon name="shield" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label={d.dismiss}>
            ×
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="saved-library__toast" role="status">
          <Icon name="check" />
          <span>{notice.message}</span>
          <button type="button" onClick={undoRemove}>
            {d.undo}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LibraryCard({
  listing,
  isSaved,
  isPending,
  onSave,
  labels: d,
}: {
  listing: ListingSummary;
  isSaved: boolean;
  isPending: boolean;
  onSave: () => void;
  labels: Record<string, string>;
}) {
  const isFree = listing.price === 0;

  return (
    <article className="library-card">
      <Link href={`/ad/${listing.slug}`} className="library-card__media" aria-label={listing.title}>
        {listing.thumbUrl ? (
          <img
            src={listing.thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            width={360}
            height={260}
          />
        ) : (
          <span>
            <Icon name="image" />
            LocZ
          </span>
        )}
        {listing.isFeatured ? <i>{d.featuredNearby}</i> : null}
      </Link>
      <button
        type="button"
        className={`library-card__save${isSaved ? ' is-saved' : ''}`}
        onClick={onSave}
        disabled={isPending}
        aria-label={
          isSaved
            ? d.removeNamed.replace('{name}', listing.title)
            : d.saveNamed.replace('{name}', listing.title)
        }
        aria-pressed={isSaved}
      >
        <Icon name="heart" />
      </button>
      <div className="library-card__body">
        <div className="library-card__price">
          <strong>
            {listing.price === null
              ? d.priceOnRequest
              : isFree
                ? d.free
                : formatPrice(listing.price)}
          </strong>
          {listing.isNegotiable && !isFree ? <span>{d.negotiable}</span> : null}
        </div>
        <Link href={`/ad/${listing.slug}`}>{listing.title}</Link>
        <p>
          <Icon name="location" />
          {listing.localityName ?? listing.cityName}
        </p>
        <div className="library-card__foot">
          <span>{humanizeType(listing.type, d)}</span>
          <Link href={`/ad/${listing.slug}`}>
            {d.viewDetails} <Icon name="arrow" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function humanizeType(type: ListingSummary['type'], labels: Record<string, string>): string {
  const typeLabels: Partial<Record<ListingSummary['type'], string>> = {
    PRODUCT: labels.typeSale,
    CLASSIFIED: labels.typeClassified,
    JOB: labels.typeJob,
    OFFER: labels.typeOffer,
    SERVICE: labels.typeService,
    RENTAL: labels.typeRental,
    BUYER_REQUIREMENT: labels.typeWanted,
    EVENT: labels.typeEvent,
  };
  return typeLabels[type] ?? labels.typeLocal;
}
