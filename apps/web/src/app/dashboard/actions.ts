'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export type ListingCommand = 'pause' | 'resume' | 'sold' | 'republish' | 'delete';

/**
 * Lifecycle commands from the user's own dashboard. The API re-checks ownership on
 * every one of these, so a forged listing id fails there rather than here.
 */
export async function listingCommandAction(
  listingId: string,
  command: ListingCommand,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (command === 'delete') {
      await api(`/listings/${listingId}`, { method: 'DELETE', auth: true });
    } else {
      await api(`/listings/${listingId}/${command}`, { method: 'POST', auth: true });
    }
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Action failed' };
  }
}
