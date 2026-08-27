'use client';

import { useEffect, useId, useState } from 'react';
import type { City } from '@locz/shared-types';
import { searchCitiesAction } from '@/app/actions';
import { Icon } from '@/components/icons';

interface CityComboboxProps {
  id: string;
  name?: string;
  cities: City[];
  defaultValue?: string;
  defaultLabel?: string;
  onValueChange?: (cityId: string) => void;
  placeholder: string;
  noResultsLabel: string;
  required?: boolean;
}

export function CityCombobox({
  id,
  name = 'cityId',
  cities,
  defaultValue = '',
  defaultLabel,
  onValueChange,
  placeholder,
  noResultsLabel,
  required = false,
}: CityComboboxProps) {
  const listboxId = useId();
  const [selectedId, setSelectedId] = useState(defaultValue);
  const selectedFromOptions = cities.find((city) => city.id === selectedId);
  const [query, setQuery] = useState(
    selectedFromOptions ? cityLabel(selectedFromOptions) : selectedId ? (defaultLabel ?? '') : '',
  );
  const [results, setResults] = useState(cities);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = results.find((city) => city.id === selectedId) ?? selectedFromOptions;
  const selectedLabel = selected ? cityLabel(selected) : (defaultLabel ?? '');

  useEffect(() => {
    if (query.trim().length < 1 || query === selectedLabel) return;

    let current = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void searchCitiesAction(query).then((matches) => {
        if (!current) return;
        setResults(matches);
        setActiveIndex(0);
        setLoading(false);
      });
    }, 180);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [cities, query, selectedLabel]);

  function updateValue(cityId: string): void {
    setSelectedId(cityId);
    onValueChange?.(cityId);
  }

  function choose(city: City): void {
    updateValue(city.id);
    setQuery(cityLabel(city));
    setResults((current) =>
      current.some((option) => option.id === city.id) ? current : [city, ...current],
    );
    setOpen(false);
  }

  return (
    <div className="city-combobox">
      <input type="hidden" name={name} value={selectedId} />
      <div className="city-combobox__control">
        <Icon name="search" width="18" height="18" />
        <input
          id={id}
          type="search"
          role="combobox"
          autoComplete="off"
          required={required}
          value={query}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && results[activeIndex] ? `${listboxId}-${results[activeIndex].id}` : undefined
          }
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            updateValue('');
            setActiveIndex(0);
            setOpen(true);
            if (nextQuery.trim().length < 2) {
              setResults(cities);
              setLoading(false);
            } else {
              setLoading(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter' && open && results[activeIndex]) {
              event.preventDefault();
              choose(results[activeIndex]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {loading ? <span className="city-combobox__spinner" aria-hidden="true" /> : null}
      </div>

      {open ? (
        <ul id={listboxId} className="city-combobox__options" role="listbox">
          {results.length ? (
            results.map((city, index) => (
              <li
                id={`${listboxId}-${city.id}`}
                key={city.id}
                role="option"
                aria-selected={city.id === selectedId}
                className={index === activeIndex ? 'is-active' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(city)}
              >
                <span>
                  <strong>{city.name}</strong>
                  <small>{city.stateName}</small>
                </span>
                {city.id === selectedId ? <Icon name="check" width="16" height="16" /> : null}
              </li>
            ))
          ) : (
            <li
              className="city-combobox__empty"
              role="option"
              aria-disabled="true"
              aria-selected="false"
            >
              {loading ? placeholder : noResultsLabel}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

function cityLabel(city: City): string {
  return city.stateName ? `${city.name}, ${city.stateName}` : city.name;
}
