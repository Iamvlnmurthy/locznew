'use server';

import { revalidatePath } from 'next/cache';
import { ApiRequestError, locz } from '@/lib/api';

export interface ModerationActionState {
  error?: string;
  message?: string;
  previewUrl?: string;
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

export async function previewMediaAction(
  _prev: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const mediaId = String(formData.get('mediaId') ?? '');
  if (!mediaId) return { error: 'Missing image' };
  try {
    const preview = await locz.moderation.mediaPreview(mediaId);
    return { previewUrl: preview.url };
  } catch (error) {
    return {
      error:
        error instanceof ApiRequestError ? error.message : 'Could not load the private preview',
    };
  }
}

export async function approveMediaAction(
  _prev: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const mediaId = String(formData.get('mediaId') ?? '');
  if (!mediaId) return { error: 'Missing image' };
  try {
    await locz.moderation.approveMedia(mediaId);
  } catch (error) {
    return {
      error: error instanceof ApiRequestError ? error.message : 'Could not publish the image',
    };
  }
  revalidatePath('/moderation');
  return { message: 'Image approved and published' };
}

export async function blockMediaAction(
  _prev: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  const mediaId = String(formData.get('mediaId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!mediaId) return { error: 'Missing image' };
  if (reason.length < 10) return { error: 'Give a clear reason of at least 10 characters' };
  try {
    await locz.moderation.blockMedia(mediaId, reason);
  } catch (error) {
    return {
      error: error instanceof ApiRequestError ? error.message : 'Could not block the image',
    };
  }
  revalidatePath('/moderation');
  return { message: 'Image blocked' };
}
