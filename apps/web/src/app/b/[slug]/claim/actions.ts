'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, api } from '@/lib/api';

export interface BusinessClaimState {
  status?: 'PENDING' | 'APPROVED';
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface BusinessClaimErrorCopy {
  evidenceRequired: string;
  scaleRequired: string;
  offeringRequired: string;
  phoneInvalid: string;
  alreadyClaimed: string;
  alreadyOwned: string;
  submitError: string;
}

const value = (formData: FormData, name: string): string => String(formData.get(name) ?? '').trim();

function optionalNumber(formData: FormData, name: string): number | undefined {
  const raw = value(formData, name);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toE164(input: string): string | undefined {
  if (!input) return undefined;
  const digits = input.replace(/\D/g, '');
  const national = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : undefined;
}

export async function submitBusinessClaimAction(
  businessId: string,
  businessSlug: string,
  copy: BusinessClaimErrorCopy,
  _previous: BusinessClaimState,
  formData: FormData,
): Promise<BusinessClaimState> {
  const evidence = value(formData, 'evidence');
  const scale = value(formData, 'scale');
  const offering = value(formData, 'offering');
  const rawPhone = value(formData, 'contactPhone');
  const contactPhone = toE164(rawPhone);
  const fieldErrors: Record<string, string> = {};

  if (evidence.length < 20) fieldErrors.evidence = copy.evidenceRequired;
  if (!['INDIVIDUAL_SHOP', 'HOME_BUSINESS', 'ENTERPRISE'].includes(scale)) {
    fieldErrors.scale = copy.scaleRequired;
  }
  if (!['PRODUCTS', 'SERVICES', 'BOTH'].includes(offering)) {
    fieldErrors.offering = copy.offeringRequired;
  }
  if (rawPhone && !contactPhone) fieldErrors.contactPhone = copy.phoneInvalid;
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  try {
    const claim = await api<{ id: string; status: 'PENDING' | 'APPROVED' }>(
      `/businesses/${businessId}/claims`,
      {
        method: 'POST',
        auth: true,
        body: {
          evidence,
          scale,
          offering,
          categoryId: value(formData, 'categoryId') || undefined,
          contactPhone,
          latitude: optionalNumber(formData, 'latitude'),
          longitude: optionalNumber(formData, 'longitude'),
          locationAccuracyM: optionalNumber(formData, 'locationAccuracyM'),
        },
      },
    );
    revalidatePath(`/b/${businessSlug}`);
    revalidatePath('/dashboard');
    return { status: claim.status };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const message = error.message.toLowerCase();
      return {
        error: message.includes('already has an owner') ? copy.alreadyOwned : copy.alreadyClaimed,
      };
    }
    return { error: copy.submitError };
  }
}
