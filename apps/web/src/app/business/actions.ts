'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface BusinessFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  created?: { id: string; slug: string };
}

export interface BusinessUpdateState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface BusinessTrustState {
  ok?: boolean;
  message?: string;
  error?: string;
}

export interface BusinessStaffState {
  message?: string;
  error?: string;
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
 * Registers a business. Immediate — there is no approval step, because gating
 * registration behind review would stop the directory ever filling up, which is the
 * thing that makes it useful. Verification is a separate signal granted later.
 */
export async function createBusinessAction(
  _prev: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  const name = text(formData, 'name');
  const businessType = text(formData, 'businessType') ?? 'RETAIL_STORE';
  const categoryId = text(formData, 'categoryId');
  const cityId = text(formData, 'cityId');
  const rawPhone = text(formData, 'primaryPhone');
  const rawWhatsapp = text(formData, 'whatsappNumber');
  const email = text(formData, 'email');
  const website = text(formData, 'website');

  const fieldErrors: Record<string, string> = {};
  if (!name || name.length < 2) fieldErrors.name = 'Enter your business name';
  if (!categoryId) fieldErrors.categoryId = 'Choose a category';
  if (!cityId) fieldErrors.cityId = 'Choose your city';
  if (rawPhone && !toE164(rawPhone)) {
    fieldErrors.primaryPhone = 'Enter a valid 10-digit mobile number';
  }
  if (rawWhatsapp && !toE164(rawWhatsapp)) {
    fieldErrors.whatsappNumber = 'Enter a valid 10-digit WhatsApp number';
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = 'Enter a valid business email';
  }
  if (website) {
    try {
      const parsed = new URL(website);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        fieldErrors.website = 'Website must start with http:// or https://';
      }
    } catch {
      fieldErrors.website = 'Enter a complete website address';
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  try {
    const business = await api<{ id: string; slug: string }>('/businesses', {
      method: 'POST',
      auth: true,
      body: {
        name,
        businessType,
        categoryId,
        cityId,
        description: text(formData, 'description'),
        addressLine: text(formData, 'addressLine'),
        primaryPhone: toE164(rawPhone),
        whatsappNumber: toE164(rawWhatsapp),
        email,
        website,
      },
    });

    revalidatePath('/dashboard');
    return { created: business };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not register your business' };
  }
}

export async function updateBusinessAction(
  businessId: string,
  businessSlug: string,
  _previous: BusinessUpdateState,
  formData: FormData,
): Promise<BusinessUpdateState> {
  const name = text(formData, 'name');
  const businessType = text(formData, 'businessType') ?? 'RETAIL_STORE';
  const categoryId = text(formData, 'categoryId');
  const cityId = text(formData, 'cityId');
  const rawPhone = text(formData, 'primaryPhone');
  const rawWhatsapp = text(formData, 'whatsappNumber');
  const email = text(formData, 'email');
  const website = text(formData, 'website');
  const fieldErrors: Record<string, string> = {};

  if (!name || name.length < 2) fieldErrors.name = 'Enter your business name';
  if (!categoryId) fieldErrors.categoryId = 'Choose a category';
  if (!cityId) fieldErrors.cityId = 'Choose your city';
  if (rawPhone && !toE164(rawPhone)) {
    fieldErrors.primaryPhone = 'Enter a valid 10-digit mobile number';
  }
  if (rawWhatsapp && !toE164(rawWhatsapp)) {
    fieldErrors.whatsappNumber = 'Enter a valid 10-digit WhatsApp number';
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = 'Enter a valid business email';
  }
  if (website) {
    try {
      const parsed = new URL(website);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        fieldErrors.website = 'Website must start with http:// or https://';
      }
    } catch {
      fieldErrors.website = 'Enter a complete website address';
    }
  }
  const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    opensAt: text(formData, `opens-${dayOfWeek}`) ?? '09:00',
    closesAt: text(formData, `closes-${dayOfWeek}`) ?? '18:00',
    isClosed: formData.get(`closed-${dayOfWeek}`) === 'on',
  }));
  if (hours.some((hour) => !hour.isClosed && hour.opensAt >= hour.closesAt)) {
    fieldErrors.hours = 'Closing time must be later than opening time on every open day';
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  try {
    await api(`/businesses/${businessId}`, {
      method: 'PATCH',
      auth: true,
      body: {
        name,
        businessType,
        categoryId,
        cityId,
        description: text(formData, 'description') ?? '',
        addressLine: text(formData, 'addressLine') ?? '',
        primaryPhone: toE164(rawPhone) ?? null,
        whatsappNumber: toE164(rawWhatsapp) ?? null,
        email: email ?? null,
        website: website ?? null,
        hours,
      },
    });
    revalidatePath('/business');
    revalidatePath('/dashboard');
    revalidatePath(`/business/manage/${businessId}`);
    revalidatePath(`/b/${businessSlug}`);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update your business' };
  }
}

export async function requestBusinessVerificationAction(
  businessId: string,
  _previous: BusinessTrustState,
): Promise<BusinessTrustState> {
  try {
    await api(`/businesses/${businessId}/verification-request`, {
      method: 'POST',
      auth: true,
    });
    revalidatePath(`/business/manage/${businessId}`);
    revalidatePath('/dashboard');
    return {
      ok: true,
      message: 'Verification requested. The LocZ trust team will review your profile.',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not request verification',
    };
  }
}

export async function manageBusinessStaffAction(
  businessId: string,
  _previous: BusinessStaffState,
  formData: FormData,
): Promise<BusinessStaffState> {
  const intent = String(formData.get('intent') ?? 'add');

  try {
    if (intent === 'remove') {
      const staffId = String(formData.get('staffId') ?? '');
      if (!staffId) return { error: 'Choose a team member to remove' };
      await api(`/businesses/${businessId}/staff/${staffId}`, {
        method: 'DELETE',
        auth: true,
      });
      revalidatePath(`/business/manage/${businessId}`);
      return { message: 'Team access removed' };
    }

    const rawPhone = text(formData, 'phone');
    const phone = toE164(rawPhone);
    const role = String(formData.get('role') ?? '');
    if (!phone) return { error: 'Enter a valid 10-digit LocZ account number' };
    if (!['MANAGER', 'EDITOR', 'VIEWER'].includes(role)) {
      return { error: 'Choose a team role' };
    }
    await api(`/businesses/${businessId}/staff`, {
      method: 'POST',
      auth: true,
      body: { phone, role },
    });
    revalidatePath(`/business/manage/${businessId}`);
    return { message: 'Team access added immediately' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not update team access' };
  }
}
