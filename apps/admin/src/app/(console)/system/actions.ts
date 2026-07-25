'use server';

import { revalidatePath } from 'next/cache';
import { ApiRequestError, api } from '@/lib/api';

export interface RebuildState {
  message?: string;
  error?: string;
}

/**
 * Queues a full search reindex. The API uses a fixed job id, so a double-click enqueues
 * one rebuild rather than two concurrent full scans.
 */
export async function rebuildIndexAction(
  _prev: RebuildState,
  _formData: FormData,
): Promise<RebuildState> {
  try {
    await api('/search/index/rebuild', { method: 'POST' });
  } catch (error) {
    return {
      error: error instanceof ApiRequestError ? error.message : 'Could not queue the rebuild',
    };
  }

  revalidatePath('/system');
  return { message: 'Rebuild queued. Progress shows as the drift count falls.' };
}
