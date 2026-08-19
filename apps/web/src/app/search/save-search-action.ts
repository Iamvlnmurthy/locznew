'use server';

import { api } from '@/lib/api';

export interface SaveSearchState {
  error?: string;
  saved?: boolean;
}

/**
 * Persist the current search as a saved search so the alert processor notifies the user when a
 * new listing matches. Runs on the server so the httpOnly session cookie reaches the API — the
 * filters come from the results page the user is looking at, and the API re-derives them from
 * the same query DTO, so nothing can be saved in a shape the search would reject.
 */
export async function saveSearchAction(
  filters: Record<string, string>,
  _previous: SaveSearchState,
  formData: FormData,
): Promise<SaveSearchState> {
  const label = String(formData.get('label') ?? '').trim();
  if (label.length < 2) return { error: 'LABEL_TOO_SHORT' };

  try {
    await api('/saved-searches', {
      method: 'POST',
      auth: true,
      body: { ...filters, label: label.slice(0, 120) },
    });
    return { saved: true };
  } catch {
    // The visible message is localised on the client; a thrown API error just means "not saved".
    return { error: 'SAVE_FAILED' };
  }
}
