'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

const STORAGE_KEY = 'locz.recent-searches.v1';
const LIMIT = 8;

function readSearches(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}

function rememberSearch(query: string) {
  const clean = query.trim();
  if (!clean) return;
  const next = [
    clean,
    ...readSearches().filter((item) => item.toLowerCase() !== clean.toLowerCase()),
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, LIMIT)));
}

export function RecentSearchInput({
  id,
  placeholder,
  defaultValue = '',
  autoFocus = false,
  recentLabel,
  clearLabel,
}: {
  id: string;
  placeholder: string;
  defaultValue?: string;
  autoFocus?: boolean;
  recentLabel: string;
  clearLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.closest('form');
    if (!input || !form) return;
    setRecent(readSearches());
    if (document.activeElement === input) setFocused(true);
    const handleSubmit = () => rememberSearch(input.value);
    form.addEventListener('submit', handleSubmit);
    return () => form.removeEventListener('submit', handleSubmit);
  }, []);

  function openRecent() {
    setRecent(readSearches());
    setFocused(true);
  }

  const showRecent = focused && value.trim() === '' && recent.length > 0;

  return (
    <div className="recent-search">
      <input
        ref={inputRef}
        id={id}
        name="q"
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showRecent}
        aria-controls={`${id}-recent`}
        onChange={(event) => setValue(event.target.value)}
        onFocus={openRecent}
        onClick={openRecent}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
      />
      {showRecent ? (
        <div id={`${id}-recent`} className="recent-search__menu">
          <div className="recent-search__heading">
            <span>{recentLabel}</span>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setRecent([]);
              }}
            >
              {clearLabel}
            </button>
          </div>
          {recent.map((query) => (
            <a key={query} href={`/search?q=${encodeURIComponent(query)}`}>
              <Icon name="search" />
              <span>{query}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
