'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';
import { getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export interface SendMessageState {
  sentAt?: number;
  error?: string;
}

export async function sendMessageAction(
  conversationId: string,
  _previous: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const body = String(formData.get('message') ?? '').trim();
  const t = getTranslator(await getLocale());
  if (!body) return { error: t('chatUi.writeFirst') };
  if (body.length > 2000) return { error: t('chatUi.tooLong') };

  try {
    await api(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      auth: true,
      body: { body },
    });
    revalidatePath('/chats');
    revalidatePath(`/chats/${conversationId}`);
    revalidatePath('/dashboard');
    return { sentAt: Date.now() };
  } catch {
    return { error: t('chatUi.sendFailed') };
  }
}

export async function blockUserAction(userId: string): Promise<{ ok: boolean; error?: string }> {
  const t = getTranslator(await getLocale());
  try {
    await api('/conversations/block', {
      method: 'POST',
      auth: true,
      body: { userId, reason: 'Blocked from conversation controls' },
    });
    revalidatePath('/chats');
    revalidatePath('/dashboard');
    return { ok: true };
  } catch {
    return { ok: false, error: t('chatUi.blockFailed') };
  }
}
