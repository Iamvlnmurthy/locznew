'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export type ListingCommand = 'pause' | 'resume' | 'sold' | 'republish' | 'delete';

export interface ProfileState {
  ok?: boolean;
  error?: string;
}

export async function updateProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const bio = String(formData.get('bio') ?? '').trim();
  const preferredLanguage = String(formData.get('preferredLanguage') ?? 'EN');

  if (displayName.length < 2) return { error: 'Enter a name with at least 2 characters.' };

  try {
    await api('/users/me', {
      method: 'PATCH',
      auth: true,
      body: {
        displayName,
        email: email || undefined,
        bio: bio || undefined,
        preferredLanguage,
      },
    });
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update your profile' };
  }
}

/**
 * Lifecycle commands from the user's own dashboard. The API re-checks ownership on
 * every one of these, so a forged listing id fails there rather than here.
 */
export async function listingCommandAction(
  listingId: string,
  command: ListingCommand,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (command === 'delete') {
      await api(`/listings/${listingId}`, { method: 'DELETE', auth: true });
    } else {
      await api(`/listings/${listingId}/${command}`, { method: 'POST', auth: true });
    }
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Action failed' };
  }
}

/**
 * Save controls inside the personal library. The client updates immediately and this
 * action makes the change durable; revalidation keeps the dashboard count truthful.
 */
export async function setLibrarySaveAction(
  listingId: string,
  save: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await api(`/listings/${listingId}/save`, {
      method: save ? 'POST' : 'DELETE',
      auth: true,
    });
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not update your saved items',
    };
  }
}
