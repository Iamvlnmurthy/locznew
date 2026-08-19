'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Icon } from '@/components/icons';
import { saveSearchAction, type SaveSearchState } from './save-search-action';

/**
 * "Save this search" — turns the current results into a saved search the alert processor
 * watches, so the user is notified when a new matching listing appears. The filters are the
 * ones the results page is already showing; the server action forwards the session cookie.
 */
export function SaveSearch({
  filters,
  defaultLabel,
  labels,
}: {
  filters: Record<string, string>;
  defaultLabel: string;
  labels: {
    saveSearch: string;
    saveSearchHint: string;
    saveSearchPlaceholder: string;
    saveSearchSave: string;
    saveSearchSaved: string;
    saveSearchManage: string;
    saveSearchError: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SaveSearchState, FormData>(
    (prev, formData) => saveSearchAction(filters, prev, formData),
    {},
  );

  if (state.saved) {
    return (
      <div className="save-search save-search--done" role="status">
        <Icon name="check" />
        <span>{labels.saveSearchSaved}</span>
        <Link href="/dashboard?tab=alerts">{labels.saveSearchManage}</Link>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="save-search__trigger" onClick={() => setOpen(true)}>
        <Icon name="bell" /> {labels.saveSearch}
      </button>
    );
  }

  return (
    <form className="save-search" action={formAction}>
      <label className="save-search__label" htmlFor="save-search-name">
        <Icon name="bell" /> {labels.saveSearchHint}
      </label>
      <div className="save-search__row">
        <input
          id="save-search-name"
          name="label"
          type="text"
          defaultValue={defaultLabel}
          placeholder={labels.saveSearchPlaceholder}
          maxLength={120}
          required
          autoFocus
        />
        <button type="submit" disabled={pending}>
          {labels.saveSearchSave}
        </button>
      </div>
      {state.error ? <p className="save-search__error">{labels.saveSearchError}</p> : null}
    </form>
  );
}
