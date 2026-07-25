'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface BusinessFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  created?: { id: string; slug: string };
}

const text = (formData: FormData, name: string): string | undefined => {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? undefined : value;
};

/** Ten digits starting 6-9, normalised to E.164 for the API. */
function toE164(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const digits = input.replace(/\D/g, '');
  const national = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : undefined;
}

/**
 * Registers a business. Free and immediate — there is no approval step, because gating
 * registration behind review would stop the directory ever filling up, which is the
 * thing that makes it useful. Verification is a separate signal granted later.
 */
export async function createBusinessAction(
  _prev: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  const name = text(formData, 'name');
  const categoryId = text(formData, 'categoryId');
  const cityId = text(formData, 'cityId');
  const rawPhone = text(formData, 'primaryPhone');

  const fieldErrors: Record<string, string> = {};
  if (!name || name.length < 2) fieldErrors.name = 'Enter your business name';
  if (!categoryId) fieldErrors.categoryId = 'Choose a category';
  if (!cityId) fieldErrors.cityId = 'Choose your city';
  if (rawPhone && !toE164(rawPhone)) {
    fieldErrors.primaryPhone = 'Enter a valid 10-digit mobile number';
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  try {
    const business = await api<{ id: string; slug: string }>('/businesses', {
      method: 'POST',
      auth: true,
      body: {
        name,
        categoryId,
        cityId,
        description: text(formData, 'description'),
        addressLine: text(formData, 'addressLine'),
        primaryPhone: toE164(rawPhone),
        whatsappNumber: toE164(text(formData, 'whatsappNumber')),
        email: text(formData, 'email'),
        website: text(formData, 'website'),
      },
    });

    revalidatePath('/dashboard');
    return { created: business };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not register your business' };
  }
}
