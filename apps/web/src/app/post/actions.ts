'use server';

import { revalidatePath } from 'next/cache';
import type { ListingType } from '@locz/shared-types';
import { createListingSchema, marketplaceDetailsSchema, toFieldErrors } from '@locz/validation';
import { api } from '@/lib/api';

export interface PostAdState {
  error?: string;
  /** Keyed by field name so the form can flag the offending input. */
  fieldErrors?: Record<string, string>;
  /** Set when the listing was created — the form switches to the outcome screen. */
  outcome?: { slug: string; status: string; id: string };
}

const text = (formData: FormData, name: string): string | undefined => {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? undefined : value;
};

const number = (formData: FormData, name: string): number | undefined => {
  const value = text(formData, name);
  return value === undefined ? undefined : Number(value);
};

const checked = (formData: FormData, name: string): boolean => formData.get(name) === 'on';

/** A date input gives `YYYY-MM-DD`; the API expects an ISO datetime. */
const isoDate = (formData: FormData, name: string): string | undefined => {
  const value = text(formData, name);
  return value === undefined ? undefined : new Date(value).toISOString();
};

/**
 * Builds the type-specific half of the payload.
 *
 * Only the block matching the chosen type is sent — the API rejects unknown properties,
 * so posting a sofa with a salary field is refused rather than silently ignored.
 */
function buildTypeDetails(type: ListingType, formData: FormData): Record<string, unknown> {
  switch (type) {
    case 'JOB':
      return {
        job: {
          companyName: text(formData, 'companyName'),
          employmentType: text(formData, 'employmentType'),
          workplaceType: text(formData, 'workplaceType'),
          salaryMin: number(formData, 'salaryMin'),
          salaryMax: number(formData, 'salaryMax'),
          isSalaryVisible: checked(formData, 'isSalaryVisible'),
          openings: number(formData, 'openings') ?? 1,
          applyMethod: text(formData, 'applyMethod') ?? 'IN_APP',
          externalApplyUrl: text(formData, 'externalApplyUrl'),
          walkInDetails: text(formData, 'walkInDetails'),
        },
      };

    case 'OFFER':
      return {
        offer: {
          originalPrice: number(formData, 'originalPrice'),
          offerPrice: number(formData, 'offerPrice'),
          couponCode: text(formData, 'couponCode'),
          startsAt: isoDate(formData, 'startsAt') ?? new Date().toISOString(),
          endsAt: isoDate(formData, 'endsAt'),
          redemptionInstructions: text(formData, 'redemptionInstructions'),
        },
      };

    case 'SERVICE':
      return {
        service: {
          serviceType: text(formData, 'serviceType'),
          priceFrom: number(formData, 'priceFrom'),
          priceTo: number(formData, 'priceTo'),
          pricingUnit: text(formData, 'pricingUnit'),
          experienceYears: number(formData, 'experienceYears'),
          availability: text(formData, 'availability'),
          servesAtHome: checked(formData, 'servesAtHome'),
        },
      };

    case 'RENTAL':
      return {
        rental: {
          propertyType: text(formData, 'propertyType'),
          rentAmount: number(formData, 'rentAmount'),
          depositAmount: number(formData, 'depositAmount'),
          bedrooms: number(formData, 'bedrooms'),
          bathrooms: number(formData, 'bathrooms'),
          areaSqft: number(formData, 'areaSqft'),
          furnishing: text(formData, 'furnishing'),
          preferredTenant: text(formData, 'preferredTenant'),
        },
      };

    case 'EVENT':
      return {
        event: {
          startsAt: text(formData, 'startsAt')
            ? new Date(text(formData, 'startsAt')!).toISOString()
            : undefined,
          endsAt: text(formData, 'endsAt')
            ? new Date(text(formData, 'endsAt')!).toISOString()
            : undefined,
          venueName: text(formData, 'venueName'),
          isFreeEntry: checked(formData, 'isFreeEntry'),
          ticketPrice: number(formData, 'ticketPrice'),
          organiser: text(formData, 'organiser'),
        },
      };

    case 'BUYER_REQUIREMENT':
      return {
        buyerRequirement: {
          budgetMin: number(formData, 'budgetMin'),
          budgetMax: number(formData, 'budgetMax'),
          requiredBy: isoDate(formData, 'requiredBy'),
          preferredCondition: text(formData, 'preferredCondition'),
        },
      };

    default:
      return {};
  }
}

/**
 * Creates a listing of any type.
 *
 * The shared half is validated with the Zod schemas from `@locz/validation`, so the
 * browser applies exactly the rules the API will. Type-specific rules (a salary range
 * that runs backwards, an offer that has already expired) are enforced by the API's
 * `ListingDetailsBuilder` and surfaced here as a message — duplicating them in the
 * browser would mean two places to keep in step.
 */
export async function createListingAction(
  _prev: PostAdState,
  formData: FormData,
): Promise<PostAdState> {
  const type = (text(formData, 'type') ?? 'PRODUCT') as ListingType;
  const saveAsDraft = formData.get('saveAsDraft') === 'true';
  const isMarketplace = type === 'PRODUCT' || type === 'CLASSIFIED';

  let marketplace: Record<string, unknown> | undefined;

  if (isMarketplace) {
    const isFree = checked(formData, 'isFree');
    const price = number(formData, 'price');

    const parsedMarketplace = marketplaceDetailsSchema.safeParse({
      price: isFree ? 0 : price,
      isFree,
      isNegotiable: checked(formData, 'isNegotiable'),
      condition: text(formData, 'condition') ?? 'GOOD',
      brand: text(formData, 'brand'),
      model: text(formData, 'model'),
    });

    if (!parsedMarketplace.success) {
      return { fieldErrors: toFieldErrors(parsedMarketplace.error) };
    }
    marketplace = parsedMarketplace.data;
  }

  const parsed = createListingSchema.safeParse({
    type,
    title: formData.get('title'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    cityId: formData.get('cityId'),
    localityId: text(formData, 'localityId'),
    contactPreference: text(formData, 'contactPreference') ?? 'IN_APP_ONLY',
    ...(marketplace ? { marketplace } : {}),
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
        ...buildTypeDetails(type, formData),
        ...(text(formData, 'businessId') ? { businessId: text(formData, 'businessId') } : {}),
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
