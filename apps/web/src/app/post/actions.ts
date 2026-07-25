'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface PostAdState {
  error?: string;
  /** Set when the listing was created — the form switches to the outcome screen. */
  outcome?: { slug: string; status: string; id: string };
}

/**
 * Creates a listing. The API decides whether it publishes immediately or goes to review,
 * so the outcome screen reports what actually happened rather than promising "published".
 */
export async function createListingAction(
  _prev: PostAdState,
  formData: FormData,
): Promise<PostAdState> {
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '');
  const cityId = String(formData.get('cityId') ?? '');
  const localityId = String(formData.get('localityId') ?? '');
  const priceRaw = String(formData.get('price') ?? '').trim();
  const isFree = formData.get('isFree') === 'on';
  const isNegotiable = formData.get('isNegotiable') === 'on';
  const condition = String(formData.get('condition') ?? 'GOOD');
  const contactPreference = String(formData.get('contactPreference') ?? 'IN_APP_ONLY');
  const saveAsDraft = formData.get('saveAsDraft') === 'true';

  if (title.length < 5) return { error: 'Give your ad a clearer title (at least 5 characters)' };
  if (description.length < 10)
    return { error: 'Add a short description so buyers know what this is' };
  if (!categoryId) return { error: 'Choose a category' };
  if (!cityId) return { error: 'Choose your city' };

  const price = isFree ? 0 : priceRaw ? Number(priceRaw) : undefined;
  if (price !== undefined && (Number.isNaN(price) || price < 0)) {
    return { error: 'Enter a valid price' };
  }

  try {
    const listing = await api<{ id: string; slug: string; status: string }>('/listings', {
      method: 'POST',
      auth: true,
      body: {
        type: 'PRODUCT',
        title,
        description,
        categoryId,
        cityId,
        ...(localityId ? { localityId } : {}),
        contactPreference,
        showPhonePublicly: contactPreference !== 'IN_APP_ONLY',
        saveAsDraft,
        marketplace: {
          ...(price !== undefined ? { price } : {}),
          isFree,
          isNegotiable,
          condition,
        },
      },
    });

    revalidatePath('/dashboard');
    return { outcome: { id: listing.id, slug: listing.slug, status: listing.status } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not publish your ad' };
  }
}

/**
 * Requests a signed upload URL, pushes the bytes straight to object storage, then asks
 * the API to process the image. The file never passes through this server.
 */
export async function requestUploadUrlAction(
  listingId: string,
  mimeType: string,
  sizeBytes: number,
): Promise<{ ok: true; mediaId: string; uploadUrl: string } | { ok: false; error: string }> {
  try {
    const result = await api<{ mediaId: string; uploadUrl: string }>(
      `/listings/${listingId}/media/upload-url`,
      { method: 'POST', auth: true, body: { mimeType, sizeBytes } },
    );
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Upload failed' };
  }
}

export async function confirmUploadAction(
  mediaId: string,
): Promise<{ ok: boolean; thumbUrl?: string | null }> {
  try {
    const media = await api<{ thumbUrl: string | null }>(`/media/${mediaId}/confirm`, {
      method: 'POST',
      auth: true,
    });
    return { ok: true, thumbUrl: media.thumbUrl };
  } catch {
    return { ok: false };
  }
}
