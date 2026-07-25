'use server';

import { api } from '@/lib/api';

export async function toggleSaveAction(
  listingId: string,
  save: boolean,
): Promise<{ ok: boolean; saveCount?: number }> {
  try {
    const result = await api<{ saved: boolean; saveCount: number }>(`/listings/${listingId}/save`, {
      method: save ? 'POST' : 'DELETE',
      auth: true,
    });
    return { ok: true, saveCount: result.saveCount };
  } catch {
    return { ok: false };
  }
}

export interface EnquiryState {
  error?: string;
  sent?: boolean;
}

/**
 * Starts an enquiry thread. Personal contact details are never exchanged here — the
 * conversation lives on LocZ unless the seller chose to publish a number.
 */
export async function sendEnquiryAction(
  _prev: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const listingId = String(formData.get('listingId') ?? '');
  const message = String(formData.get('message') ?? '').trim();

  if (message.length < 2) return { error: 'Write a short message first' };

  try {
    await api('/conversations', {
      method: 'POST',
      auth: true,
      body: { listingId, message },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not send the message' };
  }

  return { sent: true };
}
