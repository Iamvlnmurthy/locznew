'use server';

import { revalidatePath } from 'next/cache';
import { ApiRequestError, api } from '@/lib/api';

export interface VerificationDecisionState {
  message?: string;
  error?: string;
}

export async function setBusinessVerificationAction(
  businessId: string,
  _previous: VerificationDecisionState,
  formData: FormData,
): Promise<VerificationDecisionState> {
  const status = String(formData.get('status') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (!['VERIFIED', 'REJECTED'].includes(status)) {
    return { error: 'Choose approve or decline' };
  }
  if (status === 'REJECTED' && note.length < 5) {
    return { error: 'Explain what the owner needs to correct' };
  }

  try {
    await api(`/businesses/${businessId}/verification`, {
      method: 'POST',
      body: { status, note: note || undefined },
    });
    revalidatePath('/businesses');
    revalidatePath('/');
    return {
      message:
        status === 'VERIFIED'
          ? 'Business verified and owner notified'
          : 'Request declined and owner notified',
    };
  } catch (error) {
    return {
      error: error instanceof ApiRequestError ? error.message : 'Could not update verification',
    };
  }
}
