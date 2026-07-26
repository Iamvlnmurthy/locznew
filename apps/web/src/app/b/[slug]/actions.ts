'use server';

import { api } from '@/lib/api';

export interface BusinessEnquiryState {
  error?: string;
  conversationId?: string;
}

export async function sendBusinessEnquiryAction(
  businessId: string,
  _previous: BusinessEnquiryState,
  formData: FormData,
): Promise<BusinessEnquiryState> {
  const message = String(formData.get('message') ?? '').trim();
  if (message.length < 2) return { error: 'Write a short message first.' };

  try {
    const conversation = await api<{ id: string }>('/conversations', {
      method: 'POST',
      auth: true,
      body: { businessId, message },
    });
    return { conversationId: conversation.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not send your enquiry' };
  }
}
