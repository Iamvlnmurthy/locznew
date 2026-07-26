'use client';

import type { Category } from '@locz/shared-types';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

interface FilterValues {
  q?: string;
  type?: string;
  categoryId?: string;
  priceMin?: string;
  priceMax?: string;
  condition?: string;
  radiusKm?: string;
  postedWithinDays?: string;
  verifiedOnly?: string;
}

export function SearchFilters({
  categories,
  values,
  labels: s,
}: {
  categories: Category[];
  values: FilterValues;
  labels: Record<string, string>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('has-search-drawer');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('has-search-drawer');
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="search-filter-trigger"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
      >
        <Icon name="sliders" />
        {s.filters}
        {activeFilterCount(values) ? <span>{activeFilterCount(values)}</span> : null}
      </button>

      {isOpen ? (
        <button
          type="button"
          className="search-filters__backdrop"
          onClick={() => setIsOpen(false)}
          aria-label={s.closeFilters}
        />
      ) : null}

      <aside className={`search-filters${isOpen ? ' is-open' : ''}`} aria-label={s.searchFilters}>
        <form className="panel" action="/search" method="get">
          <div className="search-filters__head">
            <div>
              <span className="section-kicker">{s.narrowDown}</span>
              <h2>{s.filters}</h2>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label={s.closeFilters}>
              ×
            </button>
          </div>

          {values.q ? <input type="hidden" name="q" value={values.q} /> : null}
          {values.type ? <input type="hidden" name="type" value={values.type} /> : null}

          <div className="field">
            <label htmlFor="categoryId">{s.category}</label>
            <select id="categoryId" name="categoryId" defaultValue={values.categoryId ?? ''}>
              <option value="">{s.allCategories}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="search-filter-group">
            <legend>{s.priceRange}</legend>
            <div className="search-filter-price">
              <label>
                <span>{s.minimum}</span>
                <input
                  name="priceMin"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="0"
                  defaultValue={values.priceMin ?? ''}
                />
              </label>
              <span aria-hidden="true">—</span>
              <label>
                <span>{s.maximum}</span>
                <input
                  name="priceMax"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder={s.any}
                  defaultValue={values.priceMax ?? ''}
                />
              </label>
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="condition">{s.condition}</label>
            <select id="condition" name="condition" defaultValue={values.condition ?? ''}>
              <option value="">{s.anyCondition}</option>
              <option value="NEW">{s.conditionNew}</option>
              <option value="LIKE_NEW">{s.conditionLikeNew}</option>
              <option value="GOOD">{s.conditionGood}</option>
              <option value="FAIR">{s.conditionFair}</option>
              <option value="FOR_PARTS">{s.conditionParts}</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="radiusKm">{s.distance}</label>
            <select id="radiusKm" name="radiusKm" defaultValue={values.radiusKm ?? ''}>
              <option value="">{s.entireCity}</option>
              {[1, 3, 5, 10, 25, 50].map((km) => (
                <option key={km} value={km}>
                  {s.withinKm.replace('{km}', String(km))}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="postedWithinDays">{s.posted}</label>
            <select
              id="postedWithinDays"
              name="postedWithinDays"
              defaultValue={values.postedWithinDays ?? ''}
            >
              <option value="">{s.anyTime}</option>
              <option value="1">{s.today}</option>
              <option value="7">{s.thisWeek}</option>
              <option value="30">{s.thisMonth}</option>
            </select>
          </div>

          <label className="search-filter-check">
            <input
              type="checkbox"
              name="verifiedOnly"
              value="true"
              defaultChecked={values.verifiedOnly === 'true'}
            />
            <span>
              <Icon name="shield" />
            </span>
            <span>
              <strong>{s.verifiedOnly}</strong>
              {s.verifiedOnlyBody}
            </span>
          </label>

          <div className="search-filters__actions">
            <a href="/search" className="btn btn--ghost">
              {s.clearAll}
            </a>
            <button type="submit" className="btn btn--primary">
              {s.applyFilters}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function activeFilterCount(values: FilterValues): number {
  return [
    values.categoryId,
    values.priceMin,
    values.priceMax,
    values.condition,
    values.radiusKm,
    values.postedWithinDays,
    values.verifiedOnly,
  ].filter(Boolean).length;
}
