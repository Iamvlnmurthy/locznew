'use server';

import { revalidatePath } from 'next/cache';
import { createListingSchema, marketplaceDetailsSchema, toFieldErrors } from '@locz/validation';
import { api } from '@/lib/api';

export interface PostAdState {
  error?: string;
  /** Keyed by field name so the form can flag the offending input. */
  fieldErrors?: Record<string, string>;
  /** Set when the listing was created — the form switches to the outcome screen. */
  outcome?: { slug: string; status: string; id: string };
}

/**
 * Creates a listing.
 *
 * Validated with the shared Zod schemas so the browser and the API apply exactly the
 * same rules — where they disagree the API still wins, but the user finds out before a
 * round trip rather than after it.
 *
 * The API decides whether the listing publishes immediately or goes to review, so the
 * outcome screen reports what actually happened rather than promising "published".
 */
export async function createListingAction(
  _prev: PostAdState,
  formData: FormData,
): Promise<PostAdState> {
  const isFree = formData.get('isFree') === 'on';
  const priceRaw = String(formData.get('price') ?? '').trim();
  const saveAsDraft = formData.get('saveAsDraft') === 'true';

  const marketplace = marketplaceDetailsSchema.safeParse({
    price: isFree ? 0 : priceRaw === '' ? undefined : Number(priceRaw),
    isFree,
    isNegotiable: formData.get('isNegotiable') === 'on',
    condition: String(formData.get('condition') ?? 'GOOD'),
    brand: String(formData.get('brand') ?? '') || undefined,
    model: String(formData.get('model') ?? '') || undefined,
  });

  if (!marketplace.success) {
    return { fieldErrors: toFieldErrors(marketplace.error) };
  }

  const parsed = createListingSchema.safeParse({
    type: 'PRODUCT',
    title: formData.get('title'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    cityId: formData.get('cityId'),
    localityId: String(formData.get('localityId') ?? '') || undefined,
    contactPreference: String(formData.get('contactPreference') ?? 'IN_APP_ONLY'),
    marketplace: marketplace.data,
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  try {
    const listing = await api<{ id: string; slug: string; status: string }>('/listings', {
      method: 'POST',
      auth: true,
      body: {
        ...parsed.data,
        showPhonePublicly: parsed.data.contactPreference !== 'IN_APP_ONLY',
        saveAsDraft,
      },
    });

    revalidatePath('/dashboard');
    return { outcome: { id: listing.id, slug: listing.slug, status: listing.status } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not publish your ad' };
  }
}

/**
 * Requests a signed upload URL, so the browser can push the bytes straight to object
 * storage. The file never passes through this server.
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
