'use server';

import { revalidatePath } from 'next/cache';
import { ApiRequestError, locz } from '@/lib/api';

export interface ModerationActionState {
  error?: string;
  message?: string;
}

/**
 * Moderator decisions. The API performs the authorisation check, writes the audit entry
 * and re-syncs the search index — this action only carries the intent and refreshes the
 * queue so two moderators do not both act on the same listing.
 */
export async function approveListingAction(
  _prev: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const listingId = String(formData.get('listingId') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  if (!listingId) return { error: 'Missing listing' };

  try {
    await locz.moderation.approve(listingId, note || undefined);
  } catch (error) {
    return {
      error: error instanceof ApiRequestError ? error.message : 'Could not approve the listing',
    };
  }

  revalidatePath('/moderation');
  revalidatePath('/');
  return { message: 'Listing published' };
}

export async function rejectListingAction(
  _prev: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const listingId = String(formData.get('listingId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (!listingId) return { error: 'Missing listing' };
  // The reason is shown to the poster, so an empty one is not acceptable.
  if (reason.length < 5) {
    return { error: 'Give a reason — the poster sees this message' };
  }

  try {
    await locz.moderation.reject(listingId, reason);
  } catch (error) {
    return {
      error: error instanceof ApiRequestError ? error.message : 'Could not reject the listing',
    };
  }

  revalidatePath('/moderation');
  revalidatePath('/');
  return { message: 'Listing rejected' };
}
